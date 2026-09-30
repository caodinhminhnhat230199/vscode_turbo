export interface ResultSelectionRecord {
  path: string;
  count: number;
  lastSelectedAt: number;
}

export class SearchHistoryService {
  private static instance: SearchHistoryService | null = null;
  private recentQueries: string[] = [];
  private selections = new Map<string, ResultSelectionRecord>();
  private readonly maxQueries = 50;
  private readonly maxSelections = 200;

  public static getInstance(): SearchHistoryService {
    if (!SearchHistoryService.instance) {
      SearchHistoryService.instance = new SearchHistoryService();
    }
    return SearchHistoryService.instance;
  }

  public recordQuery(query: string): void {
    const clean = query.trim();
    if (!clean) {
      return;
    }

    this.recentQueries = [clean, ...this.recentQueries.filter((q) => q !== clean)].slice(
      0,
      this.maxQueries
    );
  }

  public recordSelection(fsPath: string): void {
    const current = this.selections.get(fsPath) ?? {
      path: fsPath,
      count: 0,
      lastSelectedAt: Date.now(),
    };

    current.count++;
    current.lastSelectedAt = Date.now();
    this.selections.set(fsPath, current);

    // Evict least recently selected if over capacity
    if (this.selections.size > this.maxSelections) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [key, val] of this.selections.entries()) {
        if (val.lastSelectedAt < oldestTime) {
          oldestTime = val.lastSelectedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.selections.delete(oldestKey);
      }
    }
  }

  public getRecentQueries(limit = 10): string[] {
    return this.recentQueries.slice(0, limit);
  }

  public getFrequentlySelectedPaths(): Map<string, number> {
    const map = new Map<string, number>();
    for (const [key, val] of this.selections.entries()) {
      map.set(key, val.count);
    }
    return map;
  }

  public getRecentlySelectedPaths(limit = 20): Set<string> {
    const sorted = Array.from(this.selections.values())
      .sort((a, b) => b.lastSelectedAt - a.lastSelectedAt)
      .slice(0, limit);
    return new Set(sorted.map((s) => s.path));
  }

  public clear(): void {
    this.recentQueries = [];
    this.selections.clear();
  }
}

export const searchHistoryService = SearchHistoryService.getInstance();
