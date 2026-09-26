import * as vscode from 'vscode';
import { LanguageAdapter, AdapterCapabilities } from './LanguageAdapter';
import { SymbolRecord, createSymbolRecord } from '../models/SymbolRecord';
import { logger } from '../../core/logging/Logger';

const SYMBOL_KIND_NAMES: Record<number, string> = {
  0: 'file',
  1: 'module',
  2: 'namespace',
  3: 'package',
  4: 'class',
  5: 'method',
  6: 'property',
  7: 'field',
  8: 'constructor',
  9: 'enum',
  10: 'interface',
  11: 'function',
  12: 'variable',
  13: 'constant',
  14: 'string',
  15: 'number',
  16: 'boolean',
  17: 'array',
  18: 'object',
  19: 'key',
  20: 'null',
  21: 'enumMember',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'typeParameter',
};

export class GenericLanguageAdapter implements LanguageAdapter {
  public readonly id = 'generic-lsp-adapter';
  public readonly supportedLanguages = ['*'];
  public readonly capabilities: AdapterCapabilities = {
    supportsSymbols: true,
    supportsWarmup: true,
    supportsImports: false,
    supportsReferences: false,
    supportsDependencyGraph: false,
    supportsDocumentSymbols: true,
    supportsFastFallback: true,
  };

  public canHandle(_uri: vscode.Uri, _languageId?: string): boolean {
    return true; // Generic fallback handles any file
  }

  public async warmup(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<void> {
    if (token?.isCancellationRequested) {
      return;
    }

    try {
      // 1. Request document symbols to trigger AST parsing & caching in language server
      const rawSymbols = await vscode.commands.executeCommand<
        Array<vscode.DocumentSymbol | vscode.SymbolInformation>
      >('vscode.executeDocumentSymbolProvider', uri);

      if (token?.isCancellationRequested || !rawSymbols || rawSymbols.length === 0) {
        return;
      }

      // 2. Warm definition provider for first found symbol position
      const first = rawSymbols[0];
      let pos: vscode.Position | undefined;
      if ('selectionRange' in first && first.selectionRange?.start) {
        pos = first.selectionRange.start;
      } else if ('range' in first && first.range?.start) {
        pos = first.range.start;
      } else if ('location' in first && first.location?.range?.start) {
        pos = first.location.range.start;
      }

      if (pos && !token?.isCancellationRequested) {
        await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, pos);
      }
    } catch (err) {
      logger.debug(`Generic LSP warmup skipped or failed for ${uri.fsPath}`, {
        error: String(err),
      });
    }
  }

  public async extractSymbols(uri: vscode.Uri, fileId: string): Promise<SymbolRecord[]> {
    try {
      const rawSymbols = await vscode.commands.executeCommand<
        Array<vscode.DocumentSymbol | vscode.SymbolInformation>
      >('vscode.executeDocumentSymbolProvider', uri);

      if (!rawSymbols || !Array.isArray(rawSymbols) || rawSymbols.length === 0) {
        return [];
      }

      const records: SymbolRecord[] = [];
      this.flattenSymbols(rawSymbols, fileId, records);
      return records;
    } catch (err) {
      logger.debug(`Failed to extract symbols via LSP for ${uri.fsPath}`, { error: String(err) });
      return [];
    }
  }

  private flattenSymbols(
    symbols: Array<any>,
    fileId: string,
    outRecords: SymbolRecord[],
    parentContainerName?: string
  ): void {
    for (const item of symbols) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const kindName =
        typeof item.kind === 'number'
          ? (SYMBOL_KIND_NAMES[item.kind] ?? 'symbol')
          : String(item.kind ?? 'symbol');

      let line = 0;
      let column = 0;

      // Check DocumentSymbol shape: selectionRange or range
      if (item.selectionRange?.start) {
        line = item.selectionRange.start.line;
        column = item.selectionRange.start.character;
      } else if (item.range?.start) {
        line = item.range.start.line;
        column = item.range.start.character;
      } else if (item.location?.range?.start) {
        // SymbolInformation shape
        line = item.location.range.start.line;
        column = item.location.range.start.character;
      }

      const container = item.containerName || parentContainerName;

      outRecords.push(
        createSymbolRecord({
          fileId,
          name: String(item.name || 'anonymous'),
          kind: kindName,
          line,
          column,
          containerName: container,
          adapterId: this.id,
        })
      );

      // Hierarchical DocumentSymbol children
      if (Array.isArray(item.children) && item.children.length > 0) {
        this.flattenSymbols(item.children, fileId, outRecords, item.name);
      }
    }
  }
}
