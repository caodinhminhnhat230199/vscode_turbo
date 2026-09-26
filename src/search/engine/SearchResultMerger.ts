import { SearchResult, SearchCategory } from '../models/SearchResult';

const CATEGORY_ORDER: Record<SearchCategory, number> = {
  file: 0,
  symbol: 1,
  text: 2,
};

export class SearchResultMerger {
  public static merge(
    groups: SearchResult[][],
    options?: { limit?: number; categoryFilter?: SearchCategory | 'all' }
  ): SearchResult[] {
    const flat: SearchResult[] = [];
    const seenIds = new Set<string>();

    for (const group of groups) {
      for (const item of group) {
        if (options?.categoryFilter && options.categoryFilter !== 'all') {
          if (item.category !== options.categoryFilter) {
            continue;
          }
        }

        // Deduplication key
        const key = `${item.category}:${item.uri.fsPath}:${item.label}:${(item as any).line ?? 0}`;
        if (seenIds.has(key)) {
          continue;
        }

        seenIds.add(key);
        flat.push(item);
      }
    }

    // Stable sort:
    // 1. Score descending
    // 2. Category order (file -> symbol -> text)
    // 3. Label length ascending
    // 4. Label alphabetical
    flat.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const catA = CATEGORY_ORDER[a.category];
      const catB = CATEGORY_ORDER[b.category];
      if (catA !== catB) {
        return catA - catB;
      }
      if (a.label.length !== b.label.length) {
        return a.label.length - b.label.length;
      }
      return a.label.localeCompare(b.label);
    });

    if (options?.limit && options.limit > 0) {
      return flat.slice(0, options.limit);
    }

    return flat;
  }
}
