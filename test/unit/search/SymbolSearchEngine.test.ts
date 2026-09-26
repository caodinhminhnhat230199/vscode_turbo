import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SymbolSearchEngine } from '../../../src/search/engine/SymbolSearchEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../src/index/models/SymbolRecord';

describe('SymbolSearchEngine', () => {
  let store: MemoryIndexStore;
  let engine: SymbolSearchEngine;

  const f1 = '/workspace/src/auth/service.ts';
  const f2 = '/workspace/src/models/user.ts';

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();

    await store.addFile(
      createFileRecord({
        path: f1,
        relativePath: 'src/auth/service.ts',
        language: 'typescript',
        size: 100,
        mtime: Date.now(),
      })
    );

    await store.addFile(
      createFileRecord({
        path: f2,
        relativePath: 'src/models/user.ts',
        language: 'typescript',
        size: 120,
        mtime: Date.now(),
      })
    );

    await store.replaceSymbolsForFile(f1, [
      createSymbolRecord({
        fileId: f1,
        name: 'loginUser',
        kind: 'function',
        line: 10,
        column: 0,
        adapterId: 'test',
      }),
      createSymbolRecord({
        fileId: f1,
        name: 'logoutUser',
        kind: 'function',
        line: 25,
        column: 0,
        adapterId: 'test',
      }),
    ]);

    await store.replaceSymbolsForFile(f2, [
      createSymbolRecord({
        fileId: f2,
        name: 'User',
        kind: 'class',
        line: 5,
        column: 0,
        adapterId: 'test',
      }),
      createSymbolRecord({
        fileId: f2,
        name: 'UserProfile',
        kind: 'interface',
        line: 30,
        column: 0,
        adapterId: 'test',
      }),
    ]);

    engine = new SymbolSearchEngine(store);
  });

  it('ranks exact symbol match at the top', async () => {
    const results = await engine.search('User');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('User');
    expect(results[0].score).toBeGreaterThanOrEqual(1000);
  });

  it('supports prefix search on symbols', async () => {
    const results = await engine.search('log');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].name).toContain('log');
  });

  it('applies recent file signal bonus (+150)', async () => {
    // Both f1 and f2 contain "User" in symbol names (loginUser, logoutUser, User, UserProfile)
    // When f1 is marked as recent, loginUser / logoutUser should receive bonus
    const results = await engine.search('User', {
      recentFilePaths: [f1],
    });

    const loginSym = results.find((r) => r.name === 'loginUser');
    expect(loginSym).toBeDefined();
    expect(loginSym!.score).toBeGreaterThan(200);
  });

  it('applies active file neighborhood signal bonus (+150 for active file)', async () => {
    const results = await engine.search('User', {
      activeFileUri: vscode.Uri.file(f2),
    });

    // Symbols in f2 should have neighborhood bonus
    const userSym = results.find((r) => r.name === 'User');
    expect(userSym).toBeDefined();
    expect(userSym!.score).toBeGreaterThan(1100);
  });

  it('sorts deterministically with tied scores', async () => {
    const results = await engine.search('User');
    // Scores and alphabetical ordering should produce deterministic sequence
    const names = results.map((r) => r.name);
    expect(names[0]).toBe('User');
  });
});
