import { SearchResult } from '../models/SearchResult';
import { SearchOptions } from '../models/SearchOptions';

import { FileSearchEngine } from './FileSearchEngine';
import { SymbolSearchEngine } from './SymbolSearchEngine';
import { RipgrepEngine } from './RipgrepEngine';
import { IndexStore } from '../../index/store/IndexStore';

import { SearchService, searchService } from '../SearchService';

export class SearchCoordinator {
  private static instance: SearchCoordinator | null = null;

  public readonly fileSearchEngine: FileSearchEngine;
  public readonly symbolSearchEngine: SymbolSearchEngine;
  public readonly ripgrepEngine: RipgrepEngine;
  private service: SearchService;

  public static getInstance(storeOrProvider?: IndexStore | (() => IndexStore)): SearchCoordinator {
    if (!SearchCoordinator.instance) {
      SearchCoordinator.instance = new SearchCoordinator(storeOrProvider);
    }
    return SearchCoordinator.instance;
  }

  constructor(storeOrProvider?: IndexStore | (() => IndexStore)) {
    this.fileSearchEngine = new FileSearchEngine(storeOrProvider);
    this.symbolSearchEngine = new SymbolSearchEngine(storeOrProvider);
    this.ripgrepEngine = new RipgrepEngine();
    const provider =
      typeof storeOrProvider === 'function'
        ? storeOrProvider
        : storeOrProvider
          ? () => storeOrProvider
          : undefined;
    this.service = provider ? new SearchService(provider) : searchService;
  }

  public async searchAll(
    query: string,
    options?: SearchOptions & { category?: 'all' | 'file' | 'symbol' | 'text' }
  ): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const category = options?.category ?? 'all';
    return this.service.search({
      query: trimmed,
      mode: category,
      options,
    });
  }
}

export const searchCoordinator = SearchCoordinator.getInstance();
