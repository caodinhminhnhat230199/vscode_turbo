import * as vscode from 'vscode';
import { SearchResult } from '../models/SearchResult';
import { SearchOptions } from '../models/SearchOptions';

import { FileSearchEngine } from './FileSearchEngine';
import { SymbolSearchEngine } from './SymbolSearchEngine';
import { RipgrepEngine } from './RipgrepEngine';
import { SearchResultMerger } from './SearchResultMerger';
import { IndexStore } from '../../index/store/IndexStore';

export class SearchCoordinator {
  private static instance: SearchCoordinator | null = null;

  public readonly fileSearchEngine: FileSearchEngine;
  public readonly symbolSearchEngine: SymbolSearchEngine;
  public readonly ripgrepEngine: RipgrepEngine;

  public static getInstance(store?: IndexStore): SearchCoordinator {
    if (!SearchCoordinator.instance) {
      SearchCoordinator.instance = new SearchCoordinator(store);
    }
    return SearchCoordinator.instance;
  }

  constructor(store?: IndexStore) {
    this.fileSearchEngine = new FileSearchEngine(store);
    this.symbolSearchEngine = new SymbolSearchEngine(store);
    this.ripgrepEngine = new RipgrepEngine();
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

    // Enrich options with context if not explicitly provided
    const enrichedOptions: SearchOptions = {
      ...options,
      activeFileUri: options?.activeFileUri ?? vscode.window.activeTextEditor?.document.uri,
      workspaceRoots:
        options?.workspaceRoots ??
        vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ??
        [],
    };

    if (category === 'file') {
      return this.fileSearchEngine.search(trimmed, enrichedOptions);
    }
    if (category === 'symbol') {
      return this.symbolSearchEngine.search(trimmed, enrichedOptions);
    }
    if (category === 'text') {
      return this.ripgrepEngine.search(trimmed, enrichedOptions);
    }

    // Run parallel searches
    const [files, symbols, text] = await Promise.all([
      this.fileSearchEngine.search(trimmed, enrichedOptions),
      this.symbolSearchEngine.search(trimmed, enrichedOptions),
      this.ripgrepEngine.search(trimmed, enrichedOptions),
    ]);

    return SearchResultMerger.merge([files, symbols, text], {
      limit: options?.limit ?? 50,
      categoryFilter: 'all',
    });
  }
}

export const searchCoordinator = SearchCoordinator.getInstance();
