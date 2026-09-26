import * as vscode from 'vscode';
import * as path from 'path';
import { SymbolSearchResult } from '../models/SearchResult';
import { SearchOptions } from '../models/SearchOptions';
import { computeFuzzyScore } from './FileSearchEngine';
import { IndexStore } from '../../index/store/IndexStore';
import { indexEngine } from '../../index/engine/IndexEngine';
import { SearchExcludes } from './SearchExcludes';
import { SymbolRecord } from '../../index/models/SymbolRecord';

export class SymbolSearchEngine {
  private store: IndexStore;

  constructor(store?: IndexStore) {
    this.store = store ?? indexEngine.getStore();
  }

  public async search(query: string, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = options?.limit ?? 50;
    const cancellationToken = options?.cancellationToken;

    // Fetch all symbols or candidates from store
    let symbols: SymbolRecord[] = [];
    try {
      symbols = await this.store.getAllSymbols();
    } catch {
      symbols = [];
    }

    // Cache files lookup for quick path/neighborhood checks
    const fileMap = new Map<string, { path: string; relativePath: string }>();
    try {
      const files = await this.store.getAllFiles();
      for (const f of files) {
        fileMap.set(f.id, { path: f.path, relativePath: f.relativePath });
      }
    } catch {
      // ignore
    }

    const results: SymbolSearchResult[] = [];

    const activeNormPath = options?.activeFileUri?.fsPath.replace(/\\/g, '/').toLowerCase();
    const activeDir = options?.activeFileUri
      ? path.dirname(options.activeFileUri.fsPath).replace(/\\/g, '/').toLowerCase()
      : undefined;

    const recentNorms = new Set(
      (options?.recentFilePaths ?? []).map((p) => p.replace(/\\/g, '/').toLowerCase())
    );

    for (const sym of symbols) {
      if (cancellationToken?.isCancellationRequested) {
        break;
      }

      const fileInfo = fileMap.get(sym.fileId);
      const fsPath = fileInfo?.path ?? sym.fileId;
      if (SearchExcludes.isExcluded(fsPath, { includeIgnored: options?.includeIgnored })) {
        continue;
      }

      const fuzzy = computeFuzzyScore(sym.name, trimmed);
      if (!fuzzy.matches) {
        continue;
      }

      let score = fuzzy.score;

      // Ranking signals:
      // 1. Recent usage bonus: +150
      const normPath = fsPath.replace(/\\/g, '/').toLowerCase();
      if (recentNorms.has(normPath)) {
        score += 150;
      }

      // 2. Active file neighborhood bonus: +150 for active file, +100 for same dir
      if (activeNormPath && normPath === activeNormPath) {
        score += 150;
      } else if (activeDir && path.dirname(normPath) === activeDir) {
        score += 100;
      }

      // 3. Active root bonus: +100 if within workspace root
      if (options?.workspaceRoots && options.workspaceRoots.length > 0) {
        for (const root of options.workspaceRoots) {
          const normRoot = root.replace(/\\/g, '/').toLowerCase();
          if (normPath.startsWith(normRoot)) {
            score += 100;
            break;
          }
        }
      }

      const relPath = fileInfo?.relativePath ?? path.basename(fsPath);

      results.push({
        id: `symbol:${sym.id ?? `${sym.fileId}:${sym.name}:${sym.line}`}`,
        category: 'symbol',
        score,
        uri: vscode.Uri.file(fsPath),
        label: sym.name,
        description: `${sym.kind}${sym.containerName ? ` in ${sym.containerName}` : ''}`,
        detail: `${relPath}:${sym.line + 1}`,
        name: sym.name,
        kind: sym.kind,
        containerName: sym.containerName,
        line: sym.line,
        column: sym.column,
      });
    }

    // Deterministic ranking sort:
    // Score descending -> Name length ascending -> Alphabetical -> Line ascending
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.name.length !== b.name.length) {
        return a.name.length - b.name.length;
      }
      const cmp = a.name.localeCompare(b.name);
      if (cmp !== 0) {
        return cmp;
      }
      return a.line - b.line;
    });

    return results.slice(0, limit);
  }
}
