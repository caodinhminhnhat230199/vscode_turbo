import * as vscode from 'vscode';
import { ResolvedCursorSymbol } from './navigationTypes';
import { adapterRegistry } from '../index/adapters/AdapterRegistry';

export class CursorSymbolResolver {
  public static resolve(
    document: vscode.TextDocument,
    position: vscode.Position
  ): ResolvedCursorSymbol | null {
    // 1. Adapter-specific hook
    try {
      const adapter = adapterRegistry.getAdapter(document.uri, document.languageId);
      if (adapter.resolveSymbolAtPosition) {
        const custom = adapter.resolveSymbolAtPosition(document, position);
        if (custom) {
          return custom;
        }
      }
    } catch {
      // ignore adapter hook failure, proceed with standard resolution
    }

    // 2. Use document word range
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    if (!word || word.trim().length === 0) {
      return null;
    }

    // 3. Handle qualified names (e.g. MyClass.someMethod)
    const lineText = document.lineAt(position.line).text;
    const startChar = wordRange.start.character;
    const endChar = wordRange.end.character;

    let prefixStart = startChar;
    while (prefixStart > 0 && lineText[prefixStart - 1] === '.') {
      let idStart = prefixStart - 1;
      while (idStart > 0 && /[a-zA-Z0-9_$]/.test(lineText[idStart - 1])) {
        idStart--;
      }
      if (idStart < prefixStart - 1) {
        prefixStart = idStart;
      } else {
        break;
      }
    }

    let qualifiedName: string | undefined;
    let containerName: string | undefined;

    if (prefixStart < startChar) {
      const fullQualified = lineText.substring(prefixStart, endChar);
      qualifiedName = fullQualified;
      const lastDotIndex = fullQualified.lastIndexOf('.');
      if (lastDotIndex > 0) {
        containerName = fullQualified.substring(0, lastDotIndex);
      }
    }

    return {
      name: word,
      qualifiedName,
      containerName,
      range: wordRange,
    };
  }
}
