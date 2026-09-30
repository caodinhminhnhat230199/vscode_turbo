import * as path from 'path';
import * as vscode from 'vscode';
import {
  IProjectIndexService,
  FileSearchFilterOptions,
  SymbolSearchFilterOptions,
  IndexHealthInfo,
  IndexReadinessState,
} from '../core/interfaces/IProjectIndexService';
import { FileRecord, SymbolRecord } from './models';
import { IndexStore, IndexStoreStats } from './store/IndexStore';
import { IndexEngine, indexEngine } from './engine/IndexEngine';
import { eventBus } from '../core/events/EventBus';
import { logger } from '../core/logging/Logger';
import { configService } from '../vscode/config';
import { stateStore } from '../core/state/StateStore';

export class ProjectIndexService implements IProjectIndexService {
  private static instance: ProjectIndexService | null = null;
  private engine: IndexEngine;
  private lastHealth: IndexHealthInfo = {
    status: 'healthy',
    corruptedFilesCount: 0,
    lastValidationTime: Date.now(),
  };

  public static getInstance(engine?: IndexEngine): ProjectIndexService {
    if (!ProjectIndexService.instance) {
      ProjectIndexService.instance = new ProjectIndexService(engine ?? indexEngine);
    }
    return ProjectIndexService.instance;
  }

  constructor(engine: IndexEngine) {
    this.engine = engine;
    this.wireEventSubscriptions();
  }

  private wireEventSubscriptions(): void {
    // Listen to WorkspaceWatcher events
    eventBus.on('fileCreated', async ({ fsPath }) => {
      try {
        await this.updateFile(fsPath);
      } catch (err) {
        logger.error(`Error indexing new file: ${fsPath}`, err);
      }
    });

    eventBus.on('fileChanged', async ({ fsPath }) => {
      try {
        await this.updateFile(fsPath);
      } catch (err) {
        logger.error(`Error indexing modified file: ${fsPath}`, err);
      }
    });

    eventBus.on('fileDeleted', async ({ fsPath }) => {
      try {
        await this.removeFile(fsPath);
      } catch (err) {
        logger.error(`Error removing deleted file from index: ${fsPath}`, err);
      }
    });

    eventBus.on('bulkChangeDetected', async ({ fileCount }) => {
      logger.info(`Bulk change detected (${fileCount} files). Triggering background index sync.`);
      try {
        const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
        await this.engine.restoreAndSync(roots);
      } catch (err) {
        logger.error('Error handling bulk change in ProjectIndexService', err);
      }
    });
  }

  public async initialize(roots: string[]): Promise<void> {
    await this.engine.initialize(roots);
  }

  public getStore(): IndexStore {
    return this.engine.getStore();
  }

  public getReadiness(): IndexReadinessState {
    const config = configService.getConfig();
    if (!config.enabled || !config.indexEnabled) {
      return 'disabled';
    }
    const state = stateStore.getState().indexStatus;
    if (state.status === 'error') {
      return 'error';
    }
    if (state.status === 'indexing' || this.engine.getQueueLength() > 0) {
      return 'indexing';
    }
    const store = this.engine.getStore();
    if (store.isInitialized() && (state.indexedFiles > 0 || state.status === 'idle')) {
      return 'ready';
    }
    return 'idle';
  }

  public async waitUntilReady(timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const readiness = this.getReadiness();
      if (readiness === 'ready') {
        return true;
      }
      if (readiness === 'error' || readiness === 'disabled') {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return this.getReadiness() === 'ready';
  }

  public async searchFiles(
    query: string,
    options?: FileSearchFilterOptions
  ): Promise<FileRecord[]> {
    const store = this.engine.getStore();
    const allFiles = await store.getAllFiles();
    const trimmed = query.trim().toLowerCase();
    const limit = options?.limit ?? 50;

    let matches = allFiles;

    // Filter extensions if specified
    if (options?.fileExtensions && options.fileExtensions.length > 0) {
      const allowedExts = new Set(
        options.fileExtensions.map((e) =>
          e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
        )
      );
      matches = matches.filter((f) => allowedExts.has(path.extname(f.path).toLowerCase()));
    }

    // Filter workspace roots if specified
    if (options?.workspaceRoots && options.workspaceRoots.length > 0) {
      matches = matches.filter((f) =>
        options.workspaceRoots!.some((root) => f.path.startsWith(root))
      );
    }

    if (!trimmed) {
      return matches.slice(0, limit);
    }

    // Filter by query (name, relative path, or path)
    const filtered = matches.filter((f) => {
      const name = path.basename(f.path).toLowerCase();
      const relPath = f.relativePath.toLowerCase();
      return name.includes(trimmed) || relPath.includes(trimmed);
    });

    return filtered.slice(0, limit);
  }

  public async searchSymbols(
    query: string,
    options?: SymbolSearchFilterOptions
  ): Promise<SymbolRecord[]> {
    const store = this.engine.getStore();
    const symbols = await store.searchSymbolsByName(query, {
      limit: options?.limit ?? 50,
      exact: options?.exact,
      kind: options?.kinds?.[0],
    });

    let result = symbols;
    if (options?.languages && options.languages.length > 0) {
      const allowed = new Set(options.languages.map((l) => l.toLowerCase()));
      result = result.filter((s: SymbolRecord) => allowed.has((s.adapterId || '').toLowerCase()));
    }

    if (options?.containerName) {
      const containerLower = options.containerName.toLowerCase();
      result = result.filter((s: SymbolRecord) =>
        s.containerName?.toLowerCase().includes(containerLower)
      );
    }

    return result;
  }

  public async getFile(fileId: string): Promise<FileRecord | undefined> {
    const store = this.engine.getStore();
    const byId = await store.getFileById(fileId);
    if (byId) {
      return byId;
    }
    return store.getFileByPath(fileId);
  }

  public async getSymbol(symbolId: string): Promise<SymbolRecord | undefined> {
    const store = this.engine.getStore();
    const symbols = await store.searchSymbolsByName(symbolId, { exact: true, limit: 1 });
    return symbols[0];
  }

  public getStats(): IndexStoreStats {
    const store = this.engine.getStore();
    if (typeof (store as any).getStatsSync === 'function') {
      return (store as any).getStatsSync();
    }
    return {
      fileCount: 0,
      symbolCount: 0,
      dbSizeBytes: 0,
      schemaVersion: store.getSchemaVersion(),
    };
  }

  public getHealth(): IndexHealthInfo {
    return { ...this.lastHealth };
  }

  public async updateFile(filePath: string): Promise<void> {
    await this.engine.indexFile(filePath);
  }

  public invalidateFile(filePath: string): void {
    void this.engine.indexFile(filePath);
  }

  public async removeFile(filePath: string): Promise<void> {
    await this.engine.removeFile(filePath);
  }
}

export const projectIndexService = ProjectIndexService.getInstance();
