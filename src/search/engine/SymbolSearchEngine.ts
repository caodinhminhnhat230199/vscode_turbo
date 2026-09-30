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
  private storeProvider: () => IndexStore;

  constructor(storeOrProvider?: IndexStore | (() => IndexStore)) {
    if (typeof storeOrProvider === 'function') {
      this.storeProvider = storeOrProvider;
    } else if (storeOrProvider) {
      this.storeProvider = () => storeOrProvider;
    } else {
      this.storeProvider = () => indexEngine.getStore();
    }
  }

  private get store(): IndexStore {
    return this.storeProvider();
  }

  public async search(query: string, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = options?.limit ?? 50;
    const cancellationToken = options?.cancellationToken;

    // Fetch candidates using store.searchSymbolsByName
    let symbols: SymbolRecord[] = [];
    try {
      symbols = await this.store.searchSymbolsByName(trimmed, {
        limit: limit * 4,
        kind: options?.kindFilter,
      });
    } catch {
      symbols = [];
    }

    // Cache files lookup only for candidate files
    const fileMap = new Map<string, { path: string; relativePath: string }>();
    const neededFileIds = new Set(symbols.map((s) => s.fileId));
    await Promise.all(
      Array.from(neededFileIds).map(async (fileId) => {
        try {
          const f = await this.store.getFileById(fileId);
          if (f) {
            fileMap.set(f.id, { path: f.path, relativePath: f.relativePath });
          }
        } catch {
          // ignore
        }
      })
    );

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

      // Filter by kindFilter
      if (options?.kindFilter && sym.kind.toLowerCase() !== options.kindFilter.toLowerCase()) {
        continue;
      }

      // Filter by pathFilter
      const relPath = fileInfo?.relativePath ?? path.basename(fsPath);
      if (
        options?.pathFilter &&
        !relPath.toLowerCase().includes(options.pathFilter.toLowerCase())
      ) {
        continue;
      }

      // Filter by extFilter
      const ext = path.extname(fsPath).replace(/^\./, '').toLowerCase();
      if (options?.extFilter && ext !== options.extFilter.toLowerCase()) {
        continue;
      }

      // Filter by langFilter
      if (options?.langFilter) {
        const lang = options.langFilter.toLowerCase();
        const symLang = (sym.adapterId || '').toLowerCase();
        if (symLang !== lang && !ext.includes(lang)) {
          continue;
        }
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
