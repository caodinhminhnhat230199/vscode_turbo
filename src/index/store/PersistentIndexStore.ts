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

export class PersistentIndexStore implements IndexStore {
  private initialized = false;
  private readonly schemaVersion = 1;
  private inTransaction = false;
  private isDirty = false;

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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
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
        this.handleCorruption();
      }
    } else {
      // Fresh database
      await this.flushToDisk();
    }

    this.initialized = true;
  }

  public async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    if (this.isDirty) {
      await this.flushToDisk();
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
    await this.flushToDisk();
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
    this.inTransaction = true;
    try {
      const result = await action();
      if (this.isDirty) {
        await this.flushToDisk();
      }
      return result;
    } finally {
      this.inTransaction = false;
    }
  }

  private markDirty(): void {
    this.isDirty = true;
    if (!this.inTransaction) {
      // Async flush when not inside a transaction batch
      void this.flushToDisk();
    }
  }

  private async flushToDisk(): Promise<void> {
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

    const tempPath = `${this.dbFilePath}.${Date.now()}.tmp`;
    const json = JSON.stringify(schema, null, 2);

    try {
      fs.writeFileSync(tempPath, json, 'utf8');
      fs.renameSync(tempPath, this.dbFilePath);
      this.isDirty = false;
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }

  private handleCorruption(): void {
    try {
      const backupPath = `${this.dbFilePath}.corrupted.${Date.now()}`;
      fs.renameSync(this.dbFilePath, backupPath);
      logger.warn(`Corrupted index file backed up to ${backupPath}`);
    } catch {
      // ignore
    }
    this.clearInMemory();
    void this.flushToDisk();

    try {
      vscode.window.showWarningMessage(
        'CodePulse: Corrupted index database was detected and automatically recovered.'
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
