import { FileRecord, SymbolRecord, ReferenceRecord } from '../models';

export interface IndexStoreStats {
  fileCount: number;
  symbolCount: number;
  referenceCount?: number;
  dbSizeBytes: number;
  schemaVersion: number;
}

export interface SymbolSearchOptions {
  limit?: number;
  exact?: boolean;
  kind?: string;
}

export interface IndexStore {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  isInitialized(): boolean;
  getSchemaVersion(): number;

  // File CRUD
  addFile(file: FileRecord): Promise<void>;
  updateFile(file: FileRecord): Promise<void>;
  getFileById(id: string): Promise<FileRecord | undefined>;
  getFileByPath(path: string): Promise<FileRecord | undefined>;
  deleteFile(fileId: string): Promise<void>;
  getAllFiles(): Promise<FileRecord[]>;
  searchFiles?(
    query: string,
    options?: {
      limit?: number;
      pathFilter?: string;
      extFilter?: string;
      workspaceRoots?: string[];
    }
  ): Promise<FileRecord[]>;
  getFileCount(): Promise<number>;

  // Symbol CRUD & Query
  replaceSymbolsForFile(fileId: string, symbols: SymbolRecord[]): Promise<void>;
  getSymbolsByFileId(fileId: string): Promise<SymbolRecord[]>;
  searchSymbolsByName(query: string, options?: SymbolSearchOptions): Promise<SymbolRecord[]>;
  getAllSymbols(): Promise<SymbolRecord[]>;
  getSymbolCount(): Promise<number>;

  // Reference CRUD (optional)
  replaceReferencesForFile?(fileId: string, refs: ReferenceRecord[]): Promise<void>;
  getReferencesByFileId?(fileId: string): Promise<ReferenceRecord[]>;

  // Maintenance & Stats
  clear(): Promise<void>;
  getStats(): Promise<IndexStoreStats>;
  runTransaction?<T>(action: () => Promise<T>): Promise<T>;
}
