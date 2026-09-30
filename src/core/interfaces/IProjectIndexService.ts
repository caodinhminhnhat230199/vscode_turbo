import { FileRecord, SymbolRecord } from '../../index/models';
import { IndexStoreStats } from '../../index/store/IndexStore';

export interface FileSearchFilterOptions {
  limit?: number;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  fileExtensions?: string[];
  workspaceRoots?: string[];
}

export interface SymbolSearchFilterOptions extends FileSearchFilterOptions {
  kinds?: string[];
  languages?: string[];
  containerName?: string;
  exact?: boolean;
}

export interface IndexHealthInfo {
  status: 'healthy' | 'degraded' | 'corrupted' | 'rebuilding';
  corruptedFilesCount: number;
  lastValidationTime?: number;
  recoveryReason?: string;
}

export type IndexReadinessState = 'idle' | 'indexing' | 'ready' | 'disabled' | 'error';

export interface IProjectIndexService {
  initialize(roots: string[]): Promise<void>;
  getReadiness(): IndexReadinessState;
  waitUntilReady(timeoutMs?: number): Promise<boolean>;
  getStore(): import('../../index/store/IndexStore').IndexStore;
  searchFiles(query: string, options?: FileSearchFilterOptions): Promise<FileRecord[]>;
  searchSymbols(query: string, options?: SymbolSearchFilterOptions): Promise<SymbolRecord[]>;
  getFile(fileId: string): Promise<FileRecord | undefined>;
  getSymbol(symbolId: string): Promise<SymbolRecord | undefined>;
  getStats(): IndexStoreStats;
  getHealth(): IndexHealthInfo;
  updateFile(filePath: string): Promise<void>;
  invalidateFile(filePath: string): void;
  removeFile(filePath: string): Promise<void>;
}
