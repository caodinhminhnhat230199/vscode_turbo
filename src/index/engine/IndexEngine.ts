import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IndexStore } from '../store/IndexStore';
import { MemoryIndexStore } from '../store/MemoryIndexStore';
import { PersistentIndexStore } from '../store/PersistentIndexStore';
import { createFileRecord } from '../models/FileRecord';
import { SymbolRecord } from '../models';
import { FileFingerprintEngine } from '../fingerprint/FileFingerprintEngine';
import { WorkspaceFingerprint } from '../fingerprint/WorkspaceFingerprint';
import { adapterRegistry } from '../adapters/AdapterRegistry';
import { workspaceScanner } from '../../core/workspace/WorkspaceScanner';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';
import { stateStore } from '../../core/state/StateStore';
import { statusBar } from '../../vscode/statusBar';
import { eventBus } from '../../core/events/EventBus';
import { logger } from '../../core/logging/Logger';
import { dependencyGraph } from '../../graph/DependencyGraph';

function inferLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.dart': 'dart',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.cpp': 'cpp',
  };
  return map[ext] ?? 'plaintext';
}

export interface IndexEngineOptions {
  store?: IndexStore;
  maxFileSizeKb?: number;
  maxFileSizeBytes?: number;
  concurrency?: number;
  storageDir?: string;
}

export class IndexEngine implements vscode.Disposable {
  private static instance: IndexEngine | null = null;
  private store: IndexStore;
  private isPaused = false;
  private isIndexing = false;
  private cancellationSource?: vscode.CancellationTokenSource;
  private activeRoots: string[] = [];
  private lastFingerprintHash?: string;
  private maxFileSizeBytes: number;
  private concurrency: number;
  private queue: string[] = [];
  private inFlight = new Set<string>();

  constructor(options: IndexEngineOptions = {}) {
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? (options.maxFileSizeKb ?? 1024) * 1024;
    this.concurrency = options.concurrency ?? 4;

    if (options.store) {
      this.store = options.store;
    } else if (options.storageDir) {
      const dbPath = path.join(options.storageDir, 'codepulse-index.json');
      this.store = new PersistentIndexStore(dbPath);
    } else {
      this.store = new MemoryIndexStore();
    }
  }

  public static getInstance(): IndexEngine {
    if (!IndexEngine.instance) {
      IndexEngine.instance = new IndexEngine();
    }
    return IndexEngine.instance;
  }

  public getStore(): IndexStore {
    return this.store;
  }

  public configure(options: Pick<IndexEngineOptions, 'storageDir' | 'maxFileSizeBytes'>): void {
    if (options.maxFileSizeBytes !== undefined) {
      this.setMaxFileSizeBytes(options.maxFileSizeBytes);
    }

    if (options.storageDir && !this.store.isInitialized()) {
      this.store = new PersistentIndexStore(path.join(options.storageDir, 'codepulse-index.json'));
    }
  }

  public setMaxFileSizeBytes(maxFileSizeBytes: number): void {
    if (Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0) {
      this.maxFileSizeBytes = maxFileSizeBytes;
    }
  }

  public async initialize(workspaceRoots: string[]): Promise<void> {
    this.activeRoots = workspaceRoots;
    if (!this.store.isInitialized()) {
      await this.store.initialize();
    }

    const { hash } = await WorkspaceFingerprint.compute(
      workspaceRoots,
      this.store.getSchemaVersion()
    );

    const stats = await this.store.getStats();
    if (stats.fileCount === 0 || this.lastFingerprintHash !== hash) {
      logger.info('Performing initial workspace indexing build');
      await this.rebuildIndex(workspaceRoots);
    } else {
      logger.info('Restoring existing index and performing incremental sync');
      await this.restoreAndSync(workspaceRoots);
    }

    this.lastFingerprintHash = hash;
  }

  public async rebuildIndex(workspaceRoots?: string[]): Promise<void> {
    const roots = workspaceRoots ?? this.activeRoots;
    this.activeRoots = roots;

    if (this.isIndexing) {
      this.cancelCurrentIndexing();
    }

    this.isIndexing = true;
    this.cancellationSource = new vscode.CancellationTokenSource();
    const token = this.cancellationSource.token;

    logger.info('Starting full index rebuild');
    statusBar.setState({ kind: 'indexing', progressPercent: 0 });
    stateStore.updateIndexStatus({ status: 'indexing', queueSize: 0 });

    const startTime = Date.now();
    try {
      await this.store.clear();

      // 1. Discover all candidate workspace files
      const candidatePaths: string[] = [];
      for (const root of roots) {
        if (token.isCancellationRequested) {
          break;
        }
        await workspaceScanner.scan(root, {
          token,
          onFile: (file) => {
            candidatePaths.push(file.path);
          },
        });
      }

      // 2. Filter & queue files
      this.queue = [];
      for (const filePath of candidatePaths) {
        const cls = classifyFile(filePath);
        if (cls.dependency || cls.buildArtifact || !cls.source) {
          continue;
        }
        this.queue.push(filePath);
      }

      stateStore.updateIndexStatus({
        status: 'indexing',
        totalFiles: this.queue.length,
        queueSize: this.queue.length,
      });

      // 3. Process queue with bounded concurrency
      await this.drainQueue(token);

      const stats = await this.store.getStats();
      const elapsed = Date.now() - startTime;
      logger.info(
        `Index build complete in ${elapsed}ms. Indexed ${stats.fileCount} files, ${stats.symbolCount} symbols.`
      );

      stateStore.updateIndexStatus({
        status: 'idle',
        indexedFiles: stats.fileCount,
        totalFiles: stats.fileCount,
        symbolCount: stats.symbolCount,
        queueSize: 0,
        dbSizeBytes: stats.dbSizeBytes,
      });
      statusBar.setState({ kind: 'ready' });
    } catch (err) {
      logger.error('Failed to rebuild index', err);
      stateStore.updateIndexStatus({ status: 'error' });
      statusBar.setState({ kind: 'ready' });
    } finally {
      this.isIndexing = false;
    }
  }

  public async restoreAndSync(workspaceRoots: string[]): Promise<void> {
    const token = new vscode.CancellationTokenSource().token;
    const existingFiles = await this.store.getAllFiles();
    const existingMap = new Map(existingFiles.map((f) => [f.path, f]));

    // Check existing files on disk (remove deleted)
    for (const file of existingFiles) {
      if (!fs.existsSync(file.path)) {
        await this.store.deleteFile(file.id);
      }
    }

    // Discover new/changed files
    const queueToReindex: string[] = [];
    for (const root of workspaceRoots) {
      await workspaceScanner.scan(root, {
        token,
        onFile: async (file) => {
          const cls = classifyFile(file.path);
          if (cls.dependency || cls.buildArtifact || !cls.source) {
            return;
          }

          const prev = existingMap.get(file.path);
          if (!prev) {
            queueToReindex.push(file.path);
            return;
          }

          try {
            const stat = await fs.promises.stat(file.path);
            const currentFp = FileFingerprintEngine.fromStat(file.path, stat);
            const prevFp = { path: prev.path, size: prev.size, mtime: prev.mtime };
            if (FileFingerprintEngine.hasChanged(prevFp, currentFp)) {
              queueToReindex.push(file.path);
            }
          } catch {
            // File may have changed or been deleted while scanning.
          }
        },
      });
    }

    if (queueToReindex.length > 0) {
      this.queue = queueToReindex;
      await this.drainQueue(token);
    }

    const stats = await this.store.getStats();
    stateStore.updateIndexStatus({
      status: 'idle',
      indexedFiles: stats.fileCount,
      totalFiles: stats.fileCount,
      symbolCount: stats.symbolCount,
      queueSize: 0,
      dbSizeBytes: stats.dbSizeBytes,
    });
  }

  public async indexFile(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    if (!fs.existsSync(normalized)) {
      await this.removeFile(normalized);
      return;
    }

    const cls = classifyFile(normalized);
    if (cls.dependency || cls.buildArtifact || !cls.source) {
      return;
    }

    try {
      const stat = await fs.promises.stat(normalized);
      if (stat.size > this.maxFileSizeBytes) {
        logger.debug(
          `Skipping file exceeding max size (${(stat.size / 1024).toFixed(1)}KB): ${normalized}`
        );
        return;
      }

      const lang = inferLanguageFromPath(normalized);
      const fileRecord = createFileRecord({
        path: normalized,
        relativePath: path.basename(normalized),
        language: lang,
        size: stat.size,
        mtime: Math.round(stat.mtimeMs),
        generated: cls.generated,
      });

      await this.store.addFile(fileRecord);

      // Extract symbols using language adapter with fallback
      const uri = vscode.Uri.file(normalized);
      const adapter = adapterRegistry.getAdapter(uri, lang);
      let symbols: SymbolRecord[] = [];
      try {
        symbols = await adapter.extractSymbols(uri, fileRecord.id);
      } catch (adapterErr) {
        logger.warn(
          `Adapter failed to extract symbols for ${normalized}, falling back to generic adapter`,
          { error: String(adapterErr) }
        );
        try {
          const genericAdapter = adapterRegistry.getGenericAdapter();
          symbols = await genericAdapter.extractSymbols(uri, fileRecord.id);
        } catch {
          symbols = [];
        }
      }

      await this.store.replaceSymbolsForFile(fileRecord.id, symbols);

      // Extract dependency edges and update dependency graph
      if (adapter.capabilities.supportsDependencyGraph && adapter.getDependencyEdges) {
        try {
          const edges = await adapter.getDependencyEdges(uri);
          dependencyGraph.replaceEdgesForFile(
            normalized,
            edges.map((e) => ({
              from: e.fromFile,
              to: e.toFile,
              type: e.type,
            }))
          );
        } catch {
          // ignore dependency graph edge extraction error
        }
      }

      const stats = await this.store.getStats();
      stateStore.updateIndexStatus({
        indexedFiles: stats.fileCount,
        symbolCount: stats.symbolCount,
        dbSizeBytes: stats.dbSizeBytes,
      });
      eventBus.emit('indexUpdated', { status: stateStore.getState().indexStatus });
    } catch (err) {
      logger.debug(`Error indexing file: ${normalized}`, { error: String(err) });
    }
  }

  public async removeFile(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    dependencyGraph.removeEdgesForFile(normalized);
    const existing = await this.store.getFileByPath(normalized);
    if (existing) {
      await this.store.deleteFile(existing.id);
      const stats = await this.store.getStats();
      stateStore.updateIndexStatus({
        indexedFiles: stats.fileCount,
        symbolCount: stats.symbolCount,
        dbSizeBytes: stats.dbSizeBytes,
      });
      eventBus.emit('indexUpdated', { status: stateStore.getState().indexStatus });
    }
  }

  public async clearIndex(): Promise<void> {
    this.cancelCurrentIndexing();
    this.queue = [];
    dependencyGraph.clear();
    await this.store.clear();
    stateStore.updateIndexStatus({
      status: 'idle',
      indexedFiles: 0,
      totalFiles: 0,
      symbolCount: 0,
      queueSize: 0,
      dbSizeBytes: 0,
    });
    statusBar.setState({ kind: 'ready' });
    logger.info('Project index cleared');
  }

  public pause(): void {
    this.isPaused = true;
    stateStore.updateIndexStatus({ status: 'paused' });
    statusBar.setState({ kind: 'paused', reason: 'Indexing paused by user' });
    logger.info('Indexing paused');
  }

  public resume(): void {
    this.isPaused = false;
    stateStore.updateIndexStatus({ status: 'idle' });
    statusBar.setState({ kind: 'ready' });
    logger.info('Indexing resumed');
    if (this.queue.length > 0 && !this.isIndexing) {
      const token = new vscode.CancellationTokenSource().token;
      void this.drainQueue(token);
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  private async drainQueue(token: vscode.CancellationToken): Promise<void> {
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (this.queue.length > 0) {
        if (token.isCancellationRequested) {
          break;
        }
        if (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }

        const next = this.queue.shift();
        if (!next || this.inFlight.has(next)) {
          continue;
        }

        this.inFlight.add(next);
        try {
          await this.indexFile(next);
        } finally {
          this.inFlight.delete(next);
        }

        const remaining = this.queue.length;
        stateStore.updateIndexStatus({ queueSize: remaining });
      }
    };

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  private cancelCurrentIndexing(): void {
    if (this.cancellationSource) {
      this.cancellationSource.cancel();
      this.cancellationSource.dispose();
      this.cancellationSource = undefined;
    }
  }

  public async dispose(): Promise<void> {
    this.cancelCurrentIndexing();
    this.queue = [];
    this.inFlight.clear();
    this.isPaused = true;
    if (
      'close' in this.store &&
      typeof (this.store as unknown as { close: () => Promise<void> }).close === 'function'
    ) {
      try {
        await (this.store as unknown as { close: () => Promise<void> }).close();
      } catch (err) {
        logger.error('Error closing index store during disposal', { error: String(err) });
      }
    }
  }
}

export const indexEngine = IndexEngine.getInstance();
