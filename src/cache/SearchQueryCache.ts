import { LRUCache } from './LRUCache';
import { SearchResult } from '../search/models/SearchResult';
import { eventBus } from '../core/events/EventBus';

export interface CachedQueryResult {
  query: string;
  mode: string;
  results: SearchResult[];
  timestamp: number;
}

export interface CacheKeyOptions {
  workspaceRoots?: string[];
  kindFilter?: string;
  pathFilter?: string;
  extFilter?: string;
  langFilter?: string;
  activeFile?: string;
}

export class SearchQueryCache {
  private static instance: SearchQueryCache | null = null;
  private cache: LRUCache<CachedQueryResult>;
  private hits = 0;
  private misses = 0;

  public static getInstance(maxEntries = 200): SearchQueryCache {
    if (!SearchQueryCache.instance) {
      SearchQueryCache.instance = new SearchQueryCache(maxEntries);
    }
    return SearchQueryCache.instance;
  }

  constructor(maxEntries = 200) {
    this.cache = new LRUCache<CachedQueryResult>(maxEntries);

    // Invalidate on file updates
    eventBus.on('fileCreated', () => this.clear());
    eventBus.on('fileChanged', () => this.clear());
    eventBus.on('fileDeleted', () => this.clear());
    eventBus.on('bulkChangeDetected', () => this.clear());
  }

  private makeKey(query: string, mode: string, options?: CacheKeyOptions): string {
    const parts = [mode.toLowerCase(), query.trim().toLowerCase()];
    if (options?.kindFilter) {
      parts.push(`k:${options.kindFilter.toLowerCase()}`);
    }
    if (options?.pathFilter) {
      parts.push(`p:${options.pathFilter.toLowerCase()}`);
    }
    if (options?.extFilter) {
      parts.push(`e:${options.extFilter.toLowerCase()}`);
    }
    if (options?.langFilter) {
      parts.push(`l:${options.langFilter.toLowerCase()}`);
    }
    if (options?.activeFile) {
      parts.push(`a:${options.activeFile.toLowerCase()}`);
    }
    if (options?.workspaceRoots && options.workspaceRoots.length > 0) {
      parts.push(`w:${options.workspaceRoots.slice().sort().join(',').toLowerCase()}`);
    }
    return parts.join('|');
  }

  public get(query: string, mode = 'all', options?: CacheKeyOptions): SearchResult[] | undefined {
    const key = this.makeKey(query, mode, options);
    const cached = this.cache.get<CachedQueryResult>(key);
    if (cached) {
      this.hits++;
      return cached.results;
    }
    this.misses++;
    return undefined;
  }

  public set(
    query: string,
    results: SearchResult[],
    mode = 'all',
    options?: CacheKeyOptions
  ): void {
    const key = this.makeKey(query, mode, options);
    this.cache.set(key, {
      query: query.trim().toLowerCase(),
      mode,
      results,
      timestamp: Date.now(),
    });
  }

  /**
   * Find a previously cached query that is a prefix of the current query.
   * e.g., if current query is "userService", and we cached "user", we can reuse candidates.
   */
  public findPrefixMatch(
    query: string,
    mode = 'all',
    options?: CacheKeyOptions
  ): SearchResult[] | undefined {
    const clean = query.trim().toLowerCase();
    if (clean.length < 2) {
      return undefined;
    }

    for (let len = clean.length - 1; len >= 2; len--) {
      const prefix = clean.substring(0, len);
      const key = this.makeKey(prefix, mode, options);
      const cached = this.cache.get<CachedQueryResult>(key);
      if (cached && cached.results.length > 0) {
        return cached.results;
      }
    }

    return undefined;
  }

  public getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size(),
    };
  }

  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export const searchQueryCache = SearchQueryCache.getInstance();
