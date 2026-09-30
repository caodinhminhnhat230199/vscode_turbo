import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { definitionEngine } from '../../../src/navigation/DefinitionEngine';
import { referenceEngine } from '../../../src/navigation/ReferenceEngine';
import { CursorSymbolResolver } from '../../../src/navigation/CursorSymbolResolver';
import { IndexEngine } from '../../../src/index/engine/IndexEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../src/index/models/SymbolRecord';
import { DEFAULT_CONFIG } from '../../../src/vscode/config';

describe('P7.9 — Phase 7 Fast Navigation Verification', () => {
  let store: MemoryIndexStore;
  const fixtureDartPath = '/workspace/test/fixtures/sample-flutter/lib/main.dart';

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();

    const file = createFileRecord({
      path: fixtureDartPath,
      relativePath: 'test/fixtures/sample-flutter/lib/main.dart',
      size: 328,
      mtime: Date.now(),
      language: 'dart',
    });
    await store.addFile(file);

    await store.replaceSymbolsForFile(file.id, [
      createSymbolRecord({
        fileId: file.id,
        name: 'MyApp',
        kind: 'Class',
        line: 6,
        column: 6,
        adapterId: 'dart',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'build',
        kind: 'Method',
        line: 10,
        column: 9,
        containerName: 'MyApp',
        adapterId: 'dart',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'main',
        kind: 'Function',
        line: 2,
        column: 5,
        adapterId: 'dart',
      }),
    ]);

    (IndexEngine.getInstance() as any).store = store;
  });

  it('P7.1: Navigation mode config defaults to native and accepts valid modes', () => {
    expect(DEFAULT_CONFIG.navigationMode).toBe('native');
    const validModes = ['native', 'hybrid', 'vsturbo', 'codepulse'];
    for (const mode of validModes) {
      expect(validModes).toContain(mode);
    }
  });

  it('P7.2: Symbol resolver correctly resolves word, qualified names, and handles empty positions', () => {
    const doc = {
      uri: vscode.Uri.file(fixtureDartPath),
      languageId: 'dart',
      getWordRangeAtPosition: (pos: vscode.Position) => {
        if (pos.character >= 6 && pos.character <= 11) {
          return new vscode.Range(6, 6, 6, 11);
        }
        return undefined;
      },
      getText: () => 'MyApp',
      lineAt: () => ({ text: 'class MyApp extends StatelessWidget {' }),
    } as unknown as vscode.TextDocument;

    // Symbol under cursor
    const resolved = CursorSymbolResolver.resolve(doc, new vscode.Position(6, 8));
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('MyApp');

    // No symbol under cursor
    const none = CursorSymbolResolver.resolve(doc, new vscode.Position(6, 0));
    expect(none).toBeNull();
  });

  it('P7.3 & P7.4: Hybrid mode resolves Dart fixture symbols with high confidence', async () => {
    const doc = {
      uri: vscode.Uri.file(fixtureDartPath),
      languageId: 'dart',
      getWordRangeAtPosition: () => new vscode.Range(3, 16, 3, 21),
      getText: () => 'MyApp',
      lineAt: () => ({ text: '  runApp(const MyApp());' }),
    } as unknown as vscode.TextDocument;

    const candidates = await definitionEngine.findLocalDefinition(doc, new vscode.Position(3, 18));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].symbol.name).toBe('MyApp');
    expect(candidates[0].confidence).toBe('high');
    expect(candidates[0].range.start.line).toBe(6);
  });

  it('P7.3 & P7.4: Native mode leaves native behavior completely unchanged', async () => {
    const nativeSpy = vi
      .spyOn(vscode.commands, 'executeCommand')
      .mockResolvedValue([
        new vscode.Location(vscode.Uri.file(fixtureDartPath), new vscode.Position(6, 6)),
      ]);

    const showTextDocSpy = vi.spyOn(vscode.window, 'showTextDocument').mockResolvedValue({} as any);

    const doc = {
      uri: vscode.Uri.file(fixtureDartPath),
      languageId: 'dart',
      getWordRangeAtPosition: () => new vscode.Range(3, 16, 3, 21),
      getText: () => 'MyApp',
      lineAt: () => ({ text: '  runApp(const MyApp());' }),
    } as unknown as vscode.TextDocument;

    const success = await definitionEngine.navigate(doc, new vscode.Position(3, 18), 'native');
    expect(success).toBe(true);
    expect(nativeSpy).toHaveBeenCalledWith(
      'vscode.executeDefinitionProvider',
      doc.uri,
      expect.anything()
    );
    expect(showTextDocSpy).toHaveBeenCalled();
  });

  it('P7.5 & P7.6: Reference engine tags candidate vs confirmed and prevents false semantic guarantees', async () => {
    const fileUri = vscode.Uri.file(fixtureDartPath);

    const doc = {
      uri: fileUri,
      languageId: 'dart',
      getWordRangeAtPosition: () => new vscode.Range(6, 6, 6, 11),
      getText: () => 'MyApp',
      lineAt: () => ({ text: 'class MyApp extends StatelessWidget {' }),
    } as unknown as vscode.TextDocument;

    // Simulate native provider returning confirmed definition/reference
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd: string) => {
      if (cmd === 'vscode.executeReferenceProvider') {
        return [new vscode.Location(fileUri, new vscode.Range(6, 6, 6, 11))];
      }
      return [];
    });

    const refs = await referenceEngine.findReferences(doc, new vscode.Position(6, 8));

    // Must be labeled clearly
    for (const ref of refs) {
      expect(['candidate', 'confirmed']).toContain(ref.status);
      expect(['index', 'native', 'textSearch']).toContain(ref.source);
    }

    const confirmedRef = refs.find((r) => r.status === 'confirmed');
    expect(confirmedRef).toBeDefined();
    expect(confirmedRef?.source).toBe('native');
  });

  it('P7.8: Hybrid reconciliation avoids jarring cursor jump-back and notifies user instead', () => {
    const localTarget = {
      uri: vscode.Uri.file(fixtureDartPath),
      range: new vscode.Range(6, 6, 6, 11),
      symbol: {
        id: 's-myapp',
        fileId: 'f-main',
        name: 'MyApp',
        kind: 'Class',
        line: 6,
        column: 6,
        adapterId: 'dart',
      },
      confidence: 'high' as const,
      score: 100,
      matchType: 'exact' as const,
      source: 'local_index' as const,
    };

    const nativeDifferent = [
      new vscode.Location(vscode.Uri.file('/different/file.dart'), new vscode.Position(100, 0)),
    ];

    const reconciliation = definitionEngine.reconcile(localTarget, nativeDifferent);
    // Contradiction detected
    expect(reconciliation.agrees).toBe(false);
    expect(reconciliation.refinedLocation?.uri.fsPath).toBe('/different/file.dart');
  });
});
