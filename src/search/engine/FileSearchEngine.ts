import * as vscode from 'vscode';
import * as path from 'path';
import { FileSearchResult } from '../models/SearchResult';
import { SearchOptions } from '../models/SearchOptions';
import { SearchExcludes } from './SearchExcludes';
import { IndexStore } from '../../index/store/IndexStore';
import { indexEngine } from '../../index/engine/IndexEngine';

export interface FuzzyScore {
  matches: boolean;
  score: number;
}

export function computeFuzzyScore(target: string, query: string): FuzzyScore {
  const t = target.toLowerCase();
  const q = query.toLowerCase();

  if (t === q) {
    return { matches: true, score: 1000 };
  }

  // Exact filename prefix
  if (t.startsWith(q)) {
    const ratio = q.length / t.length;
    return { matches: true, score: 800 + Math.round(ratio * 50) };
  }

  // Exact substring
  const subIdx = t.indexOf(q);
  if (subIdx >= 0) {
    return { matches: true, score: 600 - Math.min(subIdx, 50) };
  }

  // Subsequence fuzzy search
  let tIdx = 0;
  let qIdx = 0;
  let score = 200;
  let consecutive = 0;

  while (tIdx < t.length && qIdx < q.length) {
    if (t[tIdx] === q[qIdx]) {
      qIdx++;
      consecutive++;
      score += 10 + consecutive * 5;

      // Word boundary bonus
      if (tIdx === 0 || t[tIdx - 1] === '/' || t[tIdx - 1] === '_' || t[tIdx - 1] === '-') {
        score += 20;
      }
    } else {
      consecutive = 0;
    }
    tIdx++;
  }

  if (qIdx === q.length) {
    return { matches: true, score };
  }

  return { matches: false, score: 0 };
}

export class FileSearchEngine {
  private store: IndexStore;

  constructor(store?: IndexStore) {
    this.store = store ?? indexEngine.getStore();
  }

  public async search(query: string, options?: SearchOptions): Promise<FileSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = options?.limit ?? 50;
    const cancellationToken = options?.cancellationToken;

    // 1. Fetch file candidates from IndexStore or fallback
    let files: Array<{ fsPath: string; relativePath: string }> = [];
    try {
      const records = await this.store.getAllFiles();
      files = records.map((r) => ({
        fsPath: r.path,
        relativePath: r.relativePath,
      }));
    } catch {
      // Fallback
      files = [];
    }

    if (files.length === 0 && vscode.workspace.workspaceFolders) {
      // Scan via findFiles if index is empty
      const found = await vscode.workspace.findFiles(
        '**/*',
        '{**/node_modules/**,**/.git/**,**/build/**,**/.dart_tool/**,**/dist/**}',
        200,
        cancellationToken
      );
      files = found.map((u) => ({
        fsPath: u.fsPath,
        relativePath: vscode.workspace.asRelativePath(u),
      }));
    }

    const results: FileSearchResult[] = [];

    for (const file of files) {
      if (cancellationToken?.isCancellationRequested) {
        break;
      }

      if (SearchExcludes.isExcluded(file.fsPath, { includeIgnored: options?.includeIgnored })) {
        continue;
      }

      const fileName = path.basename(file.fsPath);
      const nameScore = computeFuzzyScore(fileName, trimmed);
      const pathScore = computeFuzzyScore(file.relativePath, trimmed);

      const bestScore = Math.max(
        nameScore.matches ? nameScore.score + 100 : 0, // Filename match has higher weight
        pathScore.matches ? pathScore.score : 0
      );

      if (bestScore > 0) {
        let finalScore = bestScore;

        // Neighborhood bonus: file in same directory as active file
        if (options?.activeFileUri) {
          const activeDir = path.dirname(options.activeFileUri.fsPath).replace(/\\/g, '/');
          const fileDir = path.dirname(file.fsPath).replace(/\\/g, '/');
          if (activeDir === fileDir) {
            finalScore += 50;
          }
        }

        // Recent file bonus
        if (options?.recentFilePaths) {
          const norm = file.fsPath.replace(/\\/g, '/').toLowerCase();
          if (options.recentFilePaths.some((p) => p.replace(/\\/g, '/').toLowerCase() === norm)) {
            finalScore += 75;
          }
        }

        results.push({
          id: `file:${file.fsPath}`,
          category: 'file',
          score: finalScore,
          uri: vscode.Uri.file(file.fsPath),
          label: fileName,
          description: path.dirname(file.relativePath),
          detail: file.fsPath,
          fsPath: file.fsPath,
          relativePath: file.relativePath,
          fileName,
        });
      }
    }

    // Stable sort: score desc, length asc, alphabetical
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.fileName.length !== b.fileName.length) {
        return a.fileName.length - b.fileName.length;
      }
      return a.relativePath.localeCompare(b.relativePath);
    });

    return results.slice(0, limit);
  }
}
