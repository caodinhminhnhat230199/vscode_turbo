import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { DefinitionEngine } from '../../../src/navigation/DefinitionEngine';
import { IndexEngine } from '../../../src/index/engine/IndexEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../src/index/models/SymbolRecord';

describe('DefinitionEngine', () => {
  let engine: DefinitionEngine;
  let store: MemoryIndexStore;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();

    // Add sample files and symbols
    const file1 = createFileRecord({
      path: '/workspace/lib/user_service.dart',
      relativePath: 'lib/user_service.dart',
      size: 1000,
      mtime: Date.now(),
      language: 'dart',
    });
    const file2 = createFileRecord({
      path: '/workspace/lib/other_service.dart',
      relativePath: 'lib/other_service.dart',
      size: 1000,
      mtime: Date.now(),
      language: 'dart',
    });

    await store.addFile(file1);
    await store.addFile(file2);

    await store.replaceSymbolsForFile(file1.id, [
      createSymbolRecord({
        fileId: file1.id,
        name: 'getUser',
        kind: 'Method',
        line: 10,
        column: 4,
        containerName: 'UserService',
        adapterId: 'dart',
      }),
      createSymbolRecord({
        fileId: file1.id,
        name: 'UserService',
        kind: 'Class',
        line: 2,
        column: 6,
        adapterId: 'dart',
      }),
    ]);

    await store.replaceSymbolsForFile(file2.id, [
      createSymbolRecord({
        fileId: file2.id,
        name: 'getUser',
        kind: 'Method',
        line: 25,
        column: 4,
        containerName: 'OtherService',
        adapterId: 'dart',
      }),
    ]);

    // Re-inject store into IndexEngine
    (IndexEngine.getInstance() as any).store = store;
    engine = DefinitionEngine.getInstance();
  });

  it('ranks candidates using container name and file proximity', async () => {
    const doc = {
      uri: vscode.Uri.file('/workspace/lib/user_service.dart'),
      languageId: 'dart',
      getWordRangeAtPosition: () => new vscode.Range(10, 4, 10, 11),
      getText: () => 'getUser',
      lineAt: () => ({ text: '  UserService.getUser()' }),
    } as unknown as vscode.TextDocument;

    const candidates = await engine.findLocalDefinition(doc, new vscode.Position(10, 5), {
      name: 'getUser',
      qualifiedName: 'UserService.getUser',
      containerName: 'UserService',
      range: new vscode.Range(10, 4, 10, 11),
    });

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0];
    expect(top.symbol.name).toBe('getUser');
    expect(top.symbol.containerName).toBe('UserService');
    expect(top.confidence).toBe('high');
    expect(top.score).toBeGreaterThan(candidates[1]?.score ?? 0);
  });

  it('reconciles local definition against native locations without jumping back', () => {
    const localTarget = {
      uri: vscode.Uri.file('/workspace/lib/user_service.dart'),
      range: new vscode.Range(10, 4, 10, 11),
      symbol: {
        id: 's1',
        fileId: 'f1',
        name: 'getUser',
        kind: 'Method',
        line: 10,
        column: 4,
        adapterId: 'dart',
      },
      confidence: 'high' as const,
      score: 100,
      matchType: 'exact' as const,
      source: 'local_index' as const,
    };

    // Case 1: Native location agrees (same file, nearby line)
    const nativeAgree = [
      new vscode.Location(
        vscode.Uri.file('/workspace/lib/user_service.dart'),
        new vscode.Position(11, 4)
      ),
    ];
    const resAgree = engine.reconcile(localTarget, nativeAgree);
    expect(resAgree.agrees).toBe(true);

    // Case 2: Native location contradicts (different file)
    const nativeContradict = [
      new vscode.Location(
        vscode.Uri.file('/workspace/lib/other_file.dart'),
        new vscode.Position(50, 2)
      ),
    ];
    const resContradict = engine.reconcile(localTarget, nativeContradict);
    expect(resContradict.agrees).toBe(false);
    expect(resContradict.refinedLocation).toBeDefined();
  });
});
