import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileRecord, SymbolRecord, ReferenceRecord } from '../models';
import { IndexStore, IndexStoreStats, SymbolSearchOptions } from './IndexStore';
import { logger } from '../../core/logging/Logger';
import { stateStore } from '../../core/state/StateStore';

interface PersistedSchema {
  version: number;
  updatedAt: number;
  files: Record<string, FileRecord>;
  symbols: Record<string, SymbolRecord[]>;
  references?: Record<string, ReferenceRecord[]>;
}

function isSubsequence(query: string, target: string): boolean {
  let q = 0;
  let t = 0;
  while (q < query.length && t < target.length) {
    if (query.charCodeAt(q) === target.charCodeAt(t)) {
      q++;
    }
    t++;
  }
  return q === query.length;
}

export class PersistentIndexStore implements IndexStore {
  private initialized = false;
  private readonly schemaVersion = 1;
  private transactionDepth = 0;
  private isDirty = false;
  private mutationVersion = 0;
  private flushTimer: NodeJS.Timeout | undefined;
  private flushQueue: Promise<void> = Promise.resolve();
  private readonly flushDelayMs = 200;

  private filesById = new Map<string, FileRecord>();
  private fileIdByPath = new Map<string, string>();
  private symbolsByFileId = new Map<string, SymbolRecord[]>();
  private referencesByFileId = new Map<string, ReferenceRecord[]>();

  constructor(private readonly dbFilePath: string) {}

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const dir = path.dirname(this.dbFilePath);
    await fs.promises.mkdir(dir, { recursive: true });

    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = await fs.promises.readFile(this.dbFilePath, 'utf8');
        const data: PersistedSchema = JSON.parse(raw);

        // Schema validation & migration
        if (typeof data !== 'object' || !data.version) {
          throw new Error('Invalid index database schema structure.');
        }

        if (data.version < this.schemaVersion) {
          logger.info(
            `Migrating index database from schema v${data.version} to v${this.schemaVersion}`
          );
          // Apply migrations here when schema increments
          data.version = this.schemaVersion;
        }

        // Load into memory
        this.clearInMemory();
        if (data.files) {
          for (const [id, f] of Object.entries(data.files)) {
            const normPath = f.path.replace(/\\/g, '/');
            this.filesById.set(id, { ...f, path: normPath });
            this.fileIdByPath.set(normPath, id);
          }
        }
        if (data.symbols) {
          for (const [fileId, syms] of Object.entries(data.symbols)) {
            this.symbolsByFileId.set(fileId, syms);
          }
        }
        if (data.references) {
          for (const [fileId, refs] of Object.entries(data.references)) {
            this.referencesByFileId.set(fileId, refs);
          }
        }
      } catch (err) {
        logger.error(
          `Index database corruption detected at ${this.dbFilePath}. Recovering...`,
          err
        );
        await this.handleCorruption();
      }
    } else {
      // Fresh database
      await this.enqueueFlush(true);
    }

    this.initialized = true;
  }

  public async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    this.cancelScheduledFlush();
    if (this.isDirty) {
      await this.enqueueFlush();
    } else {
      await this.flushQueue;
    }
    this.initialized = false;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getSchemaVersion(): number {
    return this.schemaVersion;
  }

  public async addFile(file: FileRecord): Promise<void> {
    this.assertInitialized();
    const normalizedPath = file.path.replace(/\\/g, '/');
    this.filesById.set(file.id, { ...file, path: normalizedPath });
    this.fileIdByPath.set(normalizedPath, file.id);
    this.markDirty();
  }

  public async updateFile(file: FileRecord): Promise<void> {
    await this.addFile(file);
  }

  public async getFileById(id: string): Promise<FileRecord | undefined> {
    this.assertInitialized();
    const file = this.filesById.get(id);
    return file ? { ...file } : undefined;
  }

  public async getFileByPath(filePath: string): Promise<FileRecord | undefined> {
    this.assertInitialized();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const id = this.fileIdByPath.get(normalizedPath);
    if (!id) {
      return undefined;
    }
    return this.getFileById(id);
  }

  public async deleteFile(fileId: string): Promise<void> {
    this.assertInitialized();
    const file = this.filesById.get(fileId);
    if (file) {
      this.fileIdByPath.delete(file.path);
      this.filesById.delete(fileId);
    }
    this.symbolsByFileId.delete(fileId);
    this.referencesByFileId.delete(fileId);
    this.markDirty();
  }

  public async getAllFiles(): Promise<FileRecord[]> {
    this.assertInitialized();
    return Array.from(this.filesById.values()).map((f) => ({ ...f }));
  }

  public async searchFiles(
    query: string,
    options?: {
      limit?: number;
      pathFilter?: string;
      extFilter?: string;
      workspaceRoots?: string[];
    }
  ): Promise<FileRecord[]> {
    this.assertInitialized();
    const limit = options?.limit ?? 100;
    const lowerQuery = query.toLowerCase().trim();
    const lowerPath = options?.pathFilter?.toLowerCase();
    const lowerExt = options?.extFilter?.toLowerCase();
    const roots = options?.workspaceRoots?.map((r) => r.replace(/\\/g, '/').toLowerCase());

    const results: FileRecord[] = [];
    for (const file of this.filesById.values()) {
      if (results.length >= limit) {
        break;
      }
      if (roots && roots.length > 0 && !roots.some((r) => file.path.toLowerCase().startsWith(r))) {
        continue;
      }
      if (lowerPath && !file.relativePath.toLowerCase().includes(lowerPath)) {
        continue;
      }
      if (lowerExt) {
        const ext = file.path.split('.').pop()?.toLowerCase();
        if (ext !== lowerExt) {
          continue;
        }
      }
      if (!lowerQuery) {
        results.push({ ...file });
        continue;
      }
      const name = file.path.split('/').pop()?.toLowerCase() ?? '';
      if (
        name.includes(lowerQuery) ||
        file.relativePath.toLowerCase().includes(lowerQuery) ||
        isSubsequence(lowerQuery, name)
      ) {
        results.push({ ...file });
      }
    }
    return results;
  }

  public async getFileCount(): Promise<number> {
    this.assertInitialized();
    return this.filesById.size;
  }

  public async replaceSymbolsForFile(fileId: string, symbols: SymbolRecord[]): Promise<void> {
    this.assertInitialized();
    this.symbolsByFileId.set(fileId, [...symbols]);
    this.markDirty();
  }

  public async getSymbolsByFileId(fileId: string): Promise<SymbolRecord[]> {
    this.assertInitialized();
    const list = this.symbolsByFileId.get(fileId) ?? [];
    return list.map((s) => ({ ...s }));
  }

  public async searchSymbolsByName(
    query: string,
    options: SymbolSearchOptions = {}
  ): Promise<SymbolRecord[]> {
    this.assertInitialized();
    const limit = options.limit ?? 50;
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return [];
    }

    const allSymbols: SymbolRecord[] = [];
    for (const symbols of this.symbolsByFileId.values()) {
      for (const s of symbols) {
        if (options.kind && s.kind !== options.kind) {
          continue;
        }

        const nameLower = s.name.toLowerCase();
        if (options.exact) {
          if (nameLower === lowerQuery) {
            allSymbols.push(s);
          }
        } else if (nameLower.includes(lowerQuery)) {
          allSymbols.push(s);
        }
      }
    }

    // Deterministic ranking: exact > prefix > length > alphabetical
    allSymbols.sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();

      const aExact = aLower === lowerQuery ? 1 : 0;
      const bExact = bLower === lowerQuery ? 1 : 0;
      if (aExact !== bExact) {
        return bExact - aExact;
      }

      const aPrefix = aLower.startsWith(lowerQuery) ? 1 : 0;
      const bPrefix = bLower.startsWith(lowerQuery) ? 1 : 0;
      if (aPrefix !== bPrefix) {
        return bPrefix - aPrefix;
      }

      if (a.name.length !== b.name.length) {
        return a.name.length - b.name.length;
      }

      return a.name.localeCompare(b.name);
    });

    return allSymbols.slice(0, limit);
  }

  public async getAllSymbols(): Promise<SymbolRecord[]> {
    this.assertInitialized();
    const results: SymbolRecord[] = [];
    for (const symbols of this.symbolsByFileId.values()) {
      results.push(...symbols);
    }
    return results;
  }

  public async getSymbolCount(): Promise<number> {
    this.assertInitialized();
    let count = 0;
    for (const symbols of this.symbolsByFileId.values()) {
      count += symbols.length;
    }
    return count;
  }

  public async replaceReferencesForFile(fileId: string, refs: ReferenceRecord[]): Promise<void> {
    this.assertInitialized();
    this.referencesByFileId.set(fileId, [...refs]);
    this.markDirty();
  }

  public async getReferencesByFileId(fileId: string): Promise<ReferenceRecord[]> {
    this.assertInitialized();
    const refs = this.referencesByFileId.get(fileId) ?? [];
    return refs.map((r) => ({ ...r }));
  }

  public async clear(): Promise<void> {
    this.clearInMemory();
    this.markDirty();
    this.cancelScheduledFlush();
    await this.enqueueFlush();
  }

  public async getStats(): Promise<IndexStoreStats> {
    const symbolCount = await this.getSymbolCount();
    let refCount = 0;
    for (const refs of this.referencesByFileId.values()) {
      refCount += refs.length;
    }

    let dbSizeBytes = 0;
    if (fs.existsSync(this.dbFilePath)) {
      try {
        dbSizeBytes = fs.statSync(this.dbFilePath).size;
      } catch {
        // ignore stat error
      }
    }

    return {
      fileCount: this.filesById.size,
      symbolCount,
      referenceCount: refCount,
      dbSizeBytes,
      schemaVersion: this.schemaVersion,
    };
  }

  public async runTransaction<T>(action: () => Promise<T>): Promise<T> {
    this.assertInitialized();
    this.transactionDepth++;
    try {
      return await action();
    } finally {
      this.transactionDepth--;
      if (this.transactionDepth === 0 && this.isDirty) {
        this.cancelScheduledFlush();
        await this.enqueueFlush();
      }
    }
  }

  private markDirty(): void {
    this.isDirty = true;
    this.mutationVersion++;
    if (this.transactionDepth === 0) {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    this.cancelScheduledFlush();
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = undefined;
      try {
        await this.enqueueFlush();
      } catch (error) {
        logger.error('Failed to persist project index', error);
      }
    }, this.flushDelayMs);
  }

  private cancelScheduledFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private enqueueFlush(force = false): Promise<void> {
    const next = this.flushQueue
      .catch(() => undefined)
      .then(async () => {
        if (force || this.isDirty) {
          await this.flushToDisk();
        }
      });
    this.flushQueue = next;
    return next;
  }

  private async flushToDisk(): Promise<void> {
    const versionToPersist = this.mutationVersion;
    const filesObj: Record<string, FileRecord> = {};
    for (const [id, f] of this.filesById.entries()) {
      filesObj[id] = f;
    }

    const symbolsObj: Record<string, SymbolRecord[]> = {};
    for (const [fileId, syms] of this.symbolsByFileId.entries()) {
      symbolsObj[fileId] = syms;
    }

    const referencesObj: Record<string, ReferenceRecord[]> = {};
    for (const [fileId, refs] of this.referencesByFileId.entries()) {
      referencesObj[fileId] = refs;
    }

    const schema: PersistedSchema = {
      version: this.schemaVersion,
      updatedAt: Date.now(),
      files: filesObj,
      symbols: symbolsObj,
      references: referencesObj,
    };

    const tempPath = `${this.dbFilePath}.${process.pid}.${versionToPersist}.${Date.now()}.tmp`;
    const json = JSON.stringify(schema, null, 2);

    try {
      await fs.promises.writeFile(tempPath, json, 'utf8');
      await fs.promises.rename(tempPath, this.dbFilePath);
      this.isDirty = this.mutationVersion !== versionToPersist;
      if (this.isDirty && this.transactionDepth === 0) {
        this.scheduleFlush();
      }
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          await fs.promises.unlink(tempPath);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }

  private async handleCorruption(): Promise<void> {
    try {
      const backupPath = `${this.dbFilePath}.corrupted.${Date.now()}`;
      await fs.promises.rename(this.dbFilePath, backupPath);
      logger.warn(`Corrupted index file backed up to ${backupPath}`);
    } catch {
      // ignore
    }
    this.clearInMemory();
    this.isDirty = true;
    this.mutationVersion++;
    await this.enqueueFlush();

    try {
      vscode.window.showWarningMessage(
        'VS Turbo: Corrupted index database was detected and automatically recovered.'
      );
      stateStore.updateIndexStatus({ status: 'idle', indexedFiles: 0, symbolCount: 0 });
    } catch {
      // ignore in environments without active UI
    }
  }

  private clearInMemory(): void {
    this.filesById.clear();
    this.fileIdByPath.clear();
    this.symbolsByFileId.clear();
    this.referencesByFileId.clear();
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('PersistentIndexStore is not initialized. Call initialize() first.');
    }
  }
}
