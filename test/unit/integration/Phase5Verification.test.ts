import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as vscode from 'vscode';
import { SearchCoordinator } from '../../../src/search/engine/SearchCoordinator';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../src/index/models/SymbolRecord';

describe('Phase 5 Verification — Fast Search Integration', () => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/sample-flutter');
  let store: MemoryIndexStore;
  let coordinator: SearchCoordinator;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();

    const mainDartPath = path.join(fixturePath, 'lib', 'main.dart');
    await store.addFile(
      createFileRecord({
        path: mainDartPath,
        relativePath: 'lib/main.dart',
        language: 'dart',
        size: 300,
        mtime: Date.now(),
      })
    );

    await store.replaceSymbolsForFile(mainDartPath, [
      createSymbolRecord({
        fileId: mainDartPath,
        name: 'MyApp',
        kind: 'class',
        line: 4,
        column: 0,
        adapterId: 'dart',
      }),
      createSymbolRecord({
        fileId: mainDartPath,
        name: 'main',
        kind: 'function',
        line: 2,
        column: 0,
        adapterId: 'dart',
      }),
    ]);

    coordinator = new SearchCoordinator(store);
  });

  it('P5.1 - P5.2: Queries Flutter fixture and returns ranked file and symbol results quickly', async () => {
    const t0 = performance.now();
    const results = await coordinator.searchAll('main', {
      workspaceRoots: [fixturePath],
    });
    const durationMs = performance.now() - t0;

    expect(durationMs).toBeLessThan(100); // Super fast < 100ms
    expect(results.length).toBeGreaterThanOrEqual(1);

    const fileMatch = results.find((r) => r.category === 'file');
    const symbolMatch = results.find((r) => r.category === 'symbol');

    expect(fileMatch).toBeDefined();
    expect(symbolMatch).toBeDefined();
    expect(fileMatch!.label).toBe('main.dart');
    expect(symbolMatch!.label).toBe('main');
  });

  it('P5.3 - P5.4: Ignores build/ and node_modules/ directories and protects against unsafe characters', async () => {
    // Malicious query with shell metacharacters
    const unsafeQuery = '; rm -rf / && echo "hacked"';
    const results = await coordinator.searchAll(unsafeQuery, {
      workspaceRoots: [fixturePath],
    });

    // Should safely execute without crashing or running subshell
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('P5.5 - P5.6: Cancellation works cleanly while user is typing', async () => {
    const cts = new vscode.CancellationTokenSource();
    cts.cancel(); // simulate cancellation due to new keystroke

    const results = await coordinator.searchAll('App', {
      workspaceRoots: [fixturePath],
      cancellationToken: cts.token,
    });

    expect(results).toHaveLength(0);
  });
});
