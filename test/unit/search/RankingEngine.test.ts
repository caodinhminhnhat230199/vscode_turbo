import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { RankingEngine } from '../../../src/search/ranking/RankingEngine';
import { FileSearchResult } from '../../../src/search/models/SearchResult';

function makeFileResult(name: string, fsPath: string): FileSearchResult {
  return {
    id: fsPath,
    category: 'file',
    score: 0.5,
    uri: vscode.Uri.file(fsPath),
    label: name,
    fileName: name,
    fsPath,
    relativePath: fsPath,
  };
}

describe('RankingEngine', () => {
  it('guarantees exact match outranks fuzzy match despite high frequency bonus', () => {
    const exact = makeFileResult('User', '/workspace/src/User.ts');
    const fuzzyWithHistory = makeFileResult('UserService', '/workspace/src/UserService.ts');

    const frequentPaths = new Map<string, number>();
    frequentPaths.set('/workspace/src/UserService.ts', 100); // Massive history

    const ranked = RankingEngine.rank([fuzzyWithHistory, exact], 'User', {
      frequentlySelectedPaths: frequentPaths,
    });

    expect(ranked[0].label).toBe('User');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('boosts files in current folder and recently opened', () => {
    const inCurrentFolder = makeFileResult('Helper.ts', '/workspace/src/auth/Helper.ts');
    const inOtherFolder = makeFileResult('Helper.ts', '/workspace/src/utils/deep/nested/Helper.ts');

    const ranked = RankingEngine.rank([inOtherFolder, inCurrentFolder], 'Helper', {
      activeFileUri: '/workspace/src/auth/Login.ts',
    });

    expect(ranked[0].uri.fsPath).toBe(vscode.Uri.file('/workspace/src/auth/Helper.ts').fsPath);
  });
});
