import { FileRecord, SymbolRecord, ReferenceRecord } from '../models';
import { IndexStore, IndexStoreStats, SymbolSearchOptions } from './IndexStore';

export class MemoryIndexStore implements IndexStore {
  private initialized = false;
  private readonly schemaVersion = 1;

  private filesById = new Map<string, FileRecord>();
  private fileIdByPath = new Map<string, string>();
  private symbolsByFileId = new Map<string, SymbolRecord[]>();
  private referencesByFileId = new Map<string, ReferenceRecord[]>();

  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  public async close(): Promise<void> {
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
  }

  public async updateFile(file: FileRecord): Promise<void> {
    await this.addFile(file);
  }

  public async getFileById(id: string): Promise<FileRecord | undefined> {
    this.assertInitialized();
    const file = this.filesById.get(id);
    return file ? { ...file } : undefined;
  }

  public async getFileByPath(path: string): Promise<FileRecord | undefined> {
    this.assertInitialized();
    const normalizedPath = path.replace(/\\/g, '/');
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

    // Deterministic ranking
    allSymbols.sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();

      // 1. Exact match priority
      const aExact = aLower === lowerQuery ? 1 : 0;
      const bExact = bLower === lowerQuery ? 1 : 0;
      if (aExact !== bExact) {
        return bExact - aExact;
      }

      // 2. Prefix match priority
      const aPrefix = aLower.startsWith(lowerQuery) ? 1 : 0;
      const bPrefix = bLower.startsWith(lowerQuery) ? 1 : 0;
      if (aPrefix !== bPrefix) {
        return bPrefix - aPrefix;
      }

      // 3. Shorter name is more relevant
      if (a.name.length !== b.name.length) {
        return a.name.length - b.name.length;
      }

      // 4. Lexicographical tie-breaker
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
  }

  public async getReferencesByFileId(fileId: string): Promise<ReferenceRecord[]> {
    this.assertInitialized();
    const refs = this.referencesByFileId.get(fileId) ?? [];
    return refs.map((r) => ({ ...r }));
  }

  public async clear(): Promise<void> {
    this.filesById.clear();
    this.fileIdByPath.clear();
    this.symbolsByFileId.clear();
    this.referencesByFileId.clear();
  }

  public async getStats(): Promise<IndexStoreStats> {
    const symbolCount = await this.getSymbolCount();
    let refCount = 0;
    for (const refs of this.referencesByFileId.values()) {
      refCount += refs.length;
    }

    // Estimate in-memory byte size
    const approxBytes = this.filesById.size * 256 + symbolCount * 128 + refCount * 64;

    return {
      fileCount: this.filesById.size,
      symbolCount,
      referenceCount: refCount,
      dbSizeBytes: approxBytes,
      schemaVersion: this.schemaVersion,
    };
  }

  public async runTransaction<T>(action: () => Promise<T>): Promise<T> {
    this.assertInitialized();
    return action();
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('MemoryIndexStore is not initialized. Call initialize() first.');
    }
  }
}
