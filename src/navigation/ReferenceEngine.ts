import * as vscode from 'vscode';
import { ReferenceItem, ResolvedCursorSymbol } from './navigationTypes';
import { CursorSymbolResolver } from './CursorSymbolResolver';
import { SearchCoordinator } from '../search/engine/SearchCoordinator';
import { TextSearchResult } from '../search/models/SearchResult';
import { logger } from '../core/logging/Logger';

export interface ReferenceLookupOptions {
  includeDeclaration?: boolean;
  localCandidatesOnly?: boolean;
  nativeOnly?: boolean;
  symbol?: ResolvedCursorSymbol;
}

export class ReferenceEngine {
  private static instance: ReferenceEngine | null = null;
  private searchCoordinator = SearchCoordinator.getInstance();

  public static getInstance(): ReferenceEngine {
    if (!ReferenceEngine.instance) {
      ReferenceEngine.instance = new ReferenceEngine();
    }
    return ReferenceEngine.instance;
  }

  public async findReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    options: ReferenceLookupOptions = {}
  ): Promise<ReferenceItem[]> {
    const targetSymbol = options.symbol ?? CursorSymbolResolver.resolve(document, position);
    if (!targetSymbol) {
      return [];
    }

    const confirmedItems: ReferenceItem[] = [];
    const candidateItems: ReferenceItem[] = [];

    // 1. Native reference provider (confirmed semantic references)
    if (!options.localCandidatesOnly) {
      try {
        const nativeLocs = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          document.uri,
          position,
          { includeDeclaration: options.includeDeclaration ?? false }
        );

        if (nativeLocs && nativeLocs.length > 0) {
          for (const loc of nativeLocs) {
            confirmedItems.push({
              uri: loc.uri,
              range: loc.range,
              status: 'confirmed',
              source: 'native',
              containerName: targetSymbol.containerName,
            });
          }
        }
      } catch (err) {
        logger.debug('Native reference provider failed or not available', { error: String(err) });
      }
    }

    // 2. Local candidate lookup (textual / word occurrences across workspace)
    if (!options.nativeOnly) {
      try {
        const textMatches = (await this.searchCoordinator.searchAll(targetSymbol.name, {
          category: 'text',
          activeFileUri: document.uri,
        })) as TextSearchResult[];

        for (const tm of textMatches) {
          if (tm.category === 'text') {
            const range = new vscode.Range(
              tm.line,
              tm.column,
              tm.line,
              tm.column + (tm.matchLength || targetSymbol.name.length)
            );

            candidateItems.push({
              uri: tm.uri,
              range,
              status: 'candidate',
              source: 'textSearch',
              previewLine: tm.lineText,
              containerName: targetSymbol.containerName,
            });
          }
        }
      } catch (err) {
        logger.debug('Local candidate reference search failed', { error: String(err) });
      }
    }

    // 3. Merge and deduplicate
    return this.mergeAndDeduplicate(confirmedItems, candidateItems, document.uri);
  }

  public mergeAndDeduplicate(
    confirmed: ReferenceItem[],
    candidates: ReferenceItem[],
    activeDocumentUri?: vscode.Uri
  ): ReferenceItem[] {
    const dedupMap = new Map<string, ReferenceItem>();

    // Confirmed items always take precedence
    for (const item of confirmed) {
      const key = `${item.uri.fsPath}:${item.range.start.line}:${item.range.start.character}`;
      dedupMap.set(key, item);
    }

    // Candidates are added only if location does not already exist
    for (const item of candidates) {
      const key = `${item.uri.fsPath}:${item.range.start.line}:${item.range.start.character}`;
      if (!dedupMap.has(key)) {
        dedupMap.set(key, item);
      }
    }

    const merged = Array.from(dedupMap.values());
    const activePath = activeDocumentUri?.fsPath.replace(/\\/g, '/');

    // Sort: confirmed first, same file first, line ascending
    merged.sort((a, b) => {
      // Confirmed before candidate
      if (a.status !== b.status) {
        return a.status === 'confirmed' ? -1 : 1;
      }

      const aPath = a.uri.fsPath.replace(/\\/g, '/');
      const bPath = b.uri.fsPath.replace(/\\/g, '/');

      // Active file proximity
      if (activePath) {
        const aIsActive = aPath === activePath;
        const bIsActive = bPath === activePath;
        if (aIsActive !== bIsActive) {
          return aIsActive ? -1 : 1;
        }
      }

      if (aPath !== bPath) {
        return aPath.localeCompare(bPath);
      }

      return a.range.start.line - b.range.start.line;
    });

    return merged;
  }
}

export const referenceEngine = ReferenceEngine.getInstance();
