import { SearchResult } from '../models/SearchResult';
import { SearchOptions } from '../models/SearchOptions';
import { IndexStore } from '../../index/store/IndexStore';
import { SymbolSearchEngine } from '../engine/SymbolSearchEngine';
import { RankingEngine } from '../ranking/RankingEngine';

export class ClassSearchEngine {
  private static readonly CLASS_KINDS = new Set([
    'class',
    'interface',
    'enum',
    'struct',
    'mixin',
    'extension',
    'type',
  ]);

  private symbolEngine: SymbolSearchEngine;

  constructor(storeOrProvider?: IndexStore | (() => IndexStore)) {
    this.symbolEngine = new SymbolSearchEngine(storeOrProvider);
  }

  public async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const rawSymbols = await this.symbolEngine.search(query, {
      ...options,
      limit: (options?.limit ?? 50) * 2, // Fetch more to allow kind filtering
    });

    // Filter to only class-like kinds
    const classResults = rawSymbols.filter((res) => {
      const kind = (res.symbolKind || (res as any).kind || '').toLowerCase();
      return ClassSearchEngine.CLASS_KINDS.has(kind);
    });

    // Tag category as class
    const tagged = classResults.map((r) => ({
      ...r,
      category: 'class' as const,
      symbolKind: (r as any).kind ?? r.symbolKind,
    }));

    return RankingEngine.rank(tagged, query, {
      activeFileUri: options?.activeFileUri?.fsPath,
    }).slice(0, options?.limit ?? 50);
  }
}
