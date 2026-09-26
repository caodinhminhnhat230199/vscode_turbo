import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { GenericLanguageAdapter } from '../../../../src/index/adapters/GenericLanguageAdapter';
import { AdapterRegistry } from '../../../../src/index/adapters/AdapterRegistry';

describe('Language Adapters (GenericLanguageAdapter & AdapterRegistry)', () => {
  it('extracts and flattens hierarchical DocumentSymbol trees', async () => {
    const adapter = new GenericLanguageAdapter();
    const uri = vscode.Uri.file('/workspace/src/example.ts');

    const mockDocSymbols = [
      {
        name: 'UserService',
        kind: 4, // Class
        range: { start: { line: 10, character: 0 } },
        children: [
          {
            name: 'getUser',
            kind: 5, // Method
            range: { start: { line: 12, character: 2 } },
            children: [],
          },
          {
            name: 'apiKey',
            kind: 6, // Property
            range: { start: { line: 15, character: 2 } },
          },
        ],
      },
    ];

    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeDocumentSymbolProvider') {
        return mockDocSymbols as any;
      }
      return undefined;
    });

    const symbols = await adapter.extractSymbols(uri, 'file-123');
    expect(symbols).toHaveLength(3);

    expect(symbols[0].name).toBe('UserService');
    expect(symbols[0].kind).toBe('class');
    expect(symbols[0].line).toBe(10);

    expect(symbols[1].name).toBe('getUser');
    expect(symbols[1].kind).toBe('method');
    expect(symbols[1].line).toBe(12);
    expect(symbols[1].containerName).toBe('UserService');

    expect(symbols[2].name).toBe('apiKey');
    expect(symbols[2].kind).toBe('property');
    expect(symbols[2].line).toBe(15);
  });

  it('extracts flat SymbolInformation results', async () => {
    const adapter = new GenericLanguageAdapter();
    const uri = vscode.Uri.file('/workspace/src/flat.ts');

    const mockFlatSymbols = [
      {
        name: 'calculateTax',
        kind: 11, // Function
        location: {
          uri,
          range: { start: { line: 25, character: 0 } },
        },
        containerName: 'TaxModule',
      },
    ];

    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeDocumentSymbolProvider') {
        return mockFlatSymbols as any;
      }
      return undefined;
    });

    const symbols = await adapter.extractSymbols(uri, 'file-999');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('calculateTax');
    expect(symbols[0].kind).toBe('function');
    expect(symbols[0].containerName).toBe('TaxModule');
  });

  it('resolves adapters through AdapterRegistry with fallback to generic', () => {
    const registry = new AdapterRegistry();

    const customAdapter = {
      id: 'custom-dart-adapter',
      supportedLanguages: ['dart'],
      capabilities: { supportsDocumentSymbols: true },
      canHandle: (uri: vscode.Uri) => uri.fsPath.endsWith('.dart'),
      extractSymbols: async () => [],
    };

    registry.register(customAdapter);

    const dartUri = vscode.Uri.file('/workspace/lib/main.dart');
    const tsUri = vscode.Uri.file('/workspace/src/index.ts');

    expect(registry.getAdapter(dartUri).id).toBe('custom-dart-adapter');
    expect(registry.getAdapter(tsUri).id).toBe('generic-lsp-adapter');
  });
});
