import { ICacheManager } from '../core/interfaces/ICacheManager';

interface CacheNode<T> {
  key: string;
  value: T;
  expiresAt?: number;
  sizeBytes?: number;
}

export class LRUCache<T = unknown> implements ICacheManager {
  private map = new Map<string, CacheNode<T>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  public get<V = T>(key: string): V | undefined {
    const node = this.map.get(key);
    if (!node) {
      return undefined;
    }

    if (node.expiresAt && Date.now() > node.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh LRU order: delete and re-insert
    this.map.delete(key);
    this.map.set(key, node);
    return node.value as unknown as V;
  }

  public set<V = T>(key: string, value: V, ttlMs?: number, sizeBytes?: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest (first key in map)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, {
      key,
      value: value as unknown as T,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
      sizeBytes,
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: string): boolean {
    return this.map.delete(key);
  }

  public invalidate(predicate?: (key: string) => boolean): number {
    if (!predicate) {
      const count = this.map.size;
      this.clear();
      return count;
    }

    let deleted = 0;
    for (const key of Array.from(this.map.keys())) {
      if (predicate(key)) {
        this.map.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  public clear(): void {
    this.map.clear();
  }

  public size(): number {
    return this.map.size;
  }
}
