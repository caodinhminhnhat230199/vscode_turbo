import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { CursorSymbolResolver } from '../../../src/navigation/CursorSymbolResolver';
import { adapterRegistry } from '../../../src/index/adapters/AdapterRegistry';
import { LanguageAdapter } from '../../../src/index/adapters/LanguageAdapter';

describe('CursorSymbolResolver', () => {
  beforeEach(() => {
    adapterRegistry.reset();
  });

  it('resolves simple identifier under cursor from document word range', () => {
    const doc = {
      uri: vscode.Uri.file('/path/to/test.dart'),
      languageId: 'dart',
      getWordRangeAtPosition: (_pos: vscode.Position) => new vscode.Range(0, 6, 0, 15),
      getText: (_range: vscode.Range) => 'MyWidget',
      lineAt: (_line: number) => ({ text: 'class MyWidget extends StatelessWidget {' }),
    } as unknown as vscode.TextDocument;

    const pos = new vscode.Position(0, 8);
    const resolved = CursorSymbolResolver.resolve(doc, pos);

    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('MyWidget');
    expect(resolved?.qualifiedName).toBeUndefined();
    expect(resolved?.containerName).toBeUndefined();
  });

  it('handles qualified names with container prefix', () => {
    const lineText = '  final user = UserService.create();';
    const startIdx = lineText.indexOf('create');
    const endIdx = startIdx + 'create'.length;

    const doc = {
      uri: vscode.Uri.file('/path/to/service.dart'),
      languageId: 'dart',
      getWordRangeAtPosition: (_pos: vscode.Position) => new vscode.Range(5, startIdx, 5, endIdx),
      getText: (_range: vscode.Range) => 'create',
      lineAt: (_line: number) => ({ text: lineText }),
    } as unknown as vscode.TextDocument;

    const pos = new vscode.Position(5, startIdx + 2);
    const resolved = CursorSymbolResolver.resolve(doc, pos);

    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('create');
    expect(resolved?.qualifiedName).toBe('UserService.create');
    expect(resolved?.containerName).toBe('UserService');
  });

  it('delegates to language adapter hook when adapter provides one', () => {
    const customAdapter: LanguageAdapter = {
      id: 'custom-dart',
      supportedLanguages: ['dart'],
      capabilities: { supportsDocumentSymbols: true },
      canHandle: () => true,
      extractSymbols: async () => [],
      resolveSymbolAtPosition: () => ({
        name: 'customHookSymbol',
        qualifiedName: 'Prefix.customHookSymbol',
        containerName: 'Prefix',
        range: new vscode.Range(1, 0, 1, 16),
      }),
    };

    adapterRegistry.register(customAdapter);

    const doc = {
      uri: vscode.Uri.file('/path/to/custom.dart'),
      languageId: 'dart',
      getWordRangeAtPosition: () => new vscode.Range(1, 0, 1, 16),
      getText: () => 'customHookSymbol',
      lineAt: () => ({ text: 'Prefix.customHookSymbol' }),
    } as unknown as vscode.TextDocument;

    const resolved = CursorSymbolResolver.resolve(doc, new vscode.Position(1, 4));
    expect(resolved?.name).toBe('customHookSymbol');
    expect(resolved?.containerName).toBe('Prefix');
  });

  it('returns null when position has no word', () => {
    const doc = {
      uri: vscode.Uri.file('/path/to/test.dart'),
      languageId: 'dart',
      getWordRangeAtPosition: () => undefined,
      lineAt: () => ({ text: '   ' }),
    } as unknown as vscode.TextDocument;

    const resolved = CursorSymbolResolver.resolve(doc, new vscode.Position(0, 1));
    expect(resolved).toBeNull();
  });
});
