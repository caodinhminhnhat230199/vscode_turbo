export interface CacheEntryMetadata {
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  ttlMs?: number;
  estimatedSizeBytes?: number;
}

export interface ICacheManager {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number, estimatedSizeBytes?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  invalidate(predicate?: (key: string) => boolean): number;
  clear(): void;
  size(): number;
}
