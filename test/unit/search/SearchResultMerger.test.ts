import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { SearchResultMerger } from '../../../src/search/engine/SearchResultMerger';
import {
  FileSearchResult,
  SymbolSearchResult,
  TextSearchResult,
} from '../../../src/search/models/SearchResult';

describe('SearchResultMerger', () => {
  const fileResult: FileSearchResult = {
    id: 'f1',
    category: 'file',
    score: 800,
    uri: vscode.Uri.file('/workspace/src/app.ts'),
    label: 'app.ts',
    fsPath: '/workspace/src/app.ts',
    relativePath: 'src/app.ts',
    fileName: 'app.ts',
  };

  const symbolResult: SymbolSearchResult = {
    id: 's1',
    category: 'symbol',
    score: 950,
    uri: vscode.Uri.file('/workspace/src/app.ts'),
    label: 'App',
    name: 'App',
    kind: 'class',
    line: 5,
    column: 0,
  };

  const textResult: TextSearchResult = {
    id: 't1',
    category: 'text',
    score: 500,
    uri: vscode.Uri.file('/workspace/src/app.ts'),
    label: 'const app = new App();',
    line: 12,
    column: 6,
    lineText: 'const app = new App();',
    matchLength: 3,
  };

  it('merges multiple categories and preserves category labels', () => {
    const merged = SearchResultMerger.merge([[fileResult], [symbolResult], [textResult]]);

    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.category)).toContain('file');
    expect(merged.map((m) => m.category)).toContain('symbol');
    expect(merged.map((m) => m.category)).toContain('text');
  });

  it('orders by score descending', () => {
    const merged = SearchResultMerger.merge([[fileResult], [symbolResult], [textResult]]);

    expect(merged[0].category).toBe('symbol'); // 950
    expect(merged[1].category).toBe('file'); // 800
    expect(merged[2].category).toBe('text'); // 500
  });

  it('deduplicates identical entries', () => {
    const duplicateSymbol: SymbolSearchResult = { ...symbolResult };
    const merged = SearchResultMerger.merge([[symbolResult], [duplicateSymbol]]);

    expect(merged).toHaveLength(1);
  });

  it('filters by category when specified', () => {
    const filesOnly = SearchResultMerger.merge([[fileResult], [symbolResult], [textResult]], {
      categoryFilter: 'file',
    });

    expect(filesOnly).toHaveLength(1);
    expect(filesOnly[0].category).toBe('file');
  });

  it('enforces limit', () => {
    const limited = SearchResultMerger.merge([[fileResult], [symbolResult], [textResult]], {
      limit: 2,
    });

    expect(limited).toHaveLength(2);
    expect(limited[0].score).toBe(950);
    expect(limited[1].score).toBe(800);
  });
});
