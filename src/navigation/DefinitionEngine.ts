import * as vscode from 'vscode';
import { ResolvedCursorSymbol, DefinitionCandidate, NavigationConfidence } from './navigationTypes';
import { CursorSymbolResolver } from './CursorSymbolResolver';
import { IndexEngine } from '../index/engine/IndexEngine';
import { SymbolRecord } from '../index/models/SymbolRecord';
import { logger } from '../core/logging/Logger';
import { navigationHistory } from '../graph/NavigationHistory';

export class DefinitionEngine {
  private static instance: DefinitionEngine | null = null;

  public static getInstance(): DefinitionEngine {
    if (!DefinitionEngine.instance) {
      DefinitionEngine.instance = new DefinitionEngine();
    }
    return DefinitionEngine.instance;
  }

  public async findLocalDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    symbol?: ResolvedCursorSymbol
  ): Promise<DefinitionCandidate[]> {
    const targetSymbol = symbol ?? CursorSymbolResolver.resolve(document, position);
    if (!targetSymbol) {
      return [];
    }

    const store = IndexEngine.getInstance().getStore();
    if (!store.isInitialized()) {
      try {
        await store.initialize();
      } catch {
        return [];
      }
    }

    // 1. Query symbol index for exact matches first
    let rawSymbols: SymbolRecord[] = [];
    try {
      rawSymbols = await store.searchSymbolsByName(targetSymbol.name, { exact: true });
      if (rawSymbols.length === 0 && targetSymbol.name.length >= 3) {
        rawSymbols = await store.searchSymbolsByName(targetSymbol.name, {
          exact: false,
          limit: 10,
        });
      }
    } catch (err) {
      logger.warn('Failed to query symbol index', { error: String(err) });
      return [];
    }

    if (rawSymbols.length === 0) {
      return [];
    }

    // 2. Rank candidates
    const activeWsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const docPath = document.uri.fsPath.replace(/\\/g, '/');

    const scoredCandidates: Array<{
      symbol: SymbolRecord;
      uri: vscode.Uri;
      range: vscode.Range;
      score: number;
      matchType: 'exact' | 'container_match' | 'fuzzy';
    }> = [];

    for (const sym of rawSymbols) {
      let filePath = sym.fileId;
      try {
        const fileRecord = await store.getFileById(sym.fileId);
        if (fileRecord?.path) {
          filePath = fileRecord.path;
        }
      } catch {
        // use sym.fileId
      }

      const normalizedFilePath = filePath.replace(/\\/g, '/');
      const uri = vscode.Uri.file(filePath);
      const range = new vscode.Range(sym.line, sym.column, sym.line, sym.column + sym.name.length);

      let score = 0;
      let matchType: 'exact' | 'container_match' | 'fuzzy' = 'fuzzy';

      // Exact name match
      if (sym.name === targetSymbol.name) {
        score += 50;
        matchType = 'exact';
      } else {
        score += 25;
      }

      // Container name match
      if (
        targetSymbol.containerName &&
        sym.containerName &&
        targetSymbol.containerName.toLowerCase() === sym.containerName.toLowerCase()
      ) {
        score += 30;
        matchType = 'container_match';
      }

      // Proximity to active file
      if (normalizedFilePath === docPath) {
        score += 25;
      }

      // Inside current workspace root
      if (
        activeWsFolder &&
        normalizedFilePath.startsWith(activeWsFolder.uri.fsPath.replace(/\\/g, '/'))
      ) {
        score += 15;
      }

      // Kind bonus
      const k = sym.kind.toLowerCase();
      if (k === 'class' || k === 'interface' || k === 'enum' || k === 'mixin') {
        score += 10;
      } else if (k === 'method' || k === 'function') {
        score += 8;
      }

      scoredCandidates.push({
        symbol: sym,
        uri,
        range,
        score,
        matchType,
      });
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    // 3. Assign confidence
    return scoredCandidates.map((c, index) => {
      let confidence: NavigationConfidence = 'low';
      const secondScore = scoredCandidates[index + 1]?.score ?? 0;

      if (c.score >= 70 && (scoredCandidates.length === 1 || c.score >= secondScore * 1.3)) {
        confidence = 'high';
      } else if (c.score >= 50) {
        confidence = 'medium';
      }

      return {
        uri: c.uri,
        range: c.range,
        symbol: c.symbol,
        confidence,
        score: c.score,
        matchType: c.matchType,
        source: 'local_index',
      };
    });
  }

  public async findNativeDefinition(
    uri: vscode.Uri,
    position: vscode.Position
  ): Promise<vscode.Location[]> {
    try {
      const result = await vscode.commands.executeCommand<
        vscode.Location[] | vscode.LocationLink[]
      >('vscode.executeDefinitionProvider', uri, position);

      if (!result || result.length === 0) {
        return [];
      }

      // Normalize LocationLink[] or Location[]
      return result.map((item) => {
        if ('targetUri' in item) {
          const link = item as vscode.LocationLink;
          return new vscode.Location(link.targetUri, link.targetRange);
        }
        return item as vscode.Location;
      });
    } catch (err) {
      logger.warn('Native definition provider failed', { error: String(err) });
      return [];
    }
  }

  public reconcile(
    localTarget: DefinitionCandidate,
    nativeLocations: vscode.Location[]
  ): { agrees: boolean; refinedLocation?: vscode.Location } {
    if (nativeLocations.length === 0) {
      return { agrees: true };
    }

    const localPath = localTarget.uri.fsPath.replace(/\\/g, '/');
    const localLine = localTarget.range.start.line;

    for (const nat of nativeLocations) {
      const natPath = nat.uri.fsPath.replace(/\\/g, '/');
      const natLine =
        nat.range && 'start' in nat.range
          ? nat.range.start.line
          : ((nat.range as unknown as vscode.Position)?.line ?? 0);

      // Agrees if same file and within 5 lines
      if (natPath === localPath && Math.abs(natLine - localLine) <= 5) {
        return { agrees: true };
      }
    }

    // Native contradicts local
    return {
      agrees: false,
      refinedLocation: nativeLocations[0],
    };
  }

  public async navigate(
    document: vscode.TextDocument,
    position: vscode.Position,
    mode: 'native' | 'hybrid' | 'codepulse' = 'native'
  ): Promise<boolean> {
    if (mode === 'native') {
      const nativeLocs = await this.findNativeDefinition(document.uri, position);
      if (nativeLocs.length > 0) {
        await vscode.window.showTextDocument(nativeLocs[0].uri, {
          selection: nativeLocs[0].range,
        });
        this.recordSuccessfulNavigation(document.uri, nativeLocs[0].uri);
        return true;
      }
      return false;
    }

    if (mode === 'hybrid') {
      const localCandidates = await this.findLocalDefinition(document, position);
      const best = localCandidates[0];

      if (best && best.confidence === 'high') {
        // Navigate immediately without waiting for slow language server
        await vscode.window.showTextDocument(best.uri, {
          selection: best.range,
        });
        this.recordSuccessfulNavigation(document.uri, best.uri, best.symbol.name);

        // Asynchronously verify with native provider in background (avoid jump-back/flicker)
        this.verifyHybridInBackground(document.uri, position, best);
        return true;
      }

      // Fall back to native if local confidence is not high
      const nativeLocs = await this.findNativeDefinition(document.uri, position);
      if (nativeLocs.length > 0) {
        await vscode.window.showTextDocument(nativeLocs[0].uri, {
          selection: nativeLocs[0].range,
        });
        this.recordSuccessfulNavigation(document.uri, nativeLocs[0].uri);
        return true;
      }

      // Fallback: if native failed but we had a medium/low local candidate, use it
      if (best) {
        await vscode.window.showTextDocument(best.uri, {
          selection: best.range,
        });
        this.recordSuccessfulNavigation(document.uri, best.uri, best.symbol.name);
        return true;
      }
      return false;
    }

    if (mode === 'codepulse') {
      // Local first, fallback to native when no candidate
      const localCandidates = await this.findLocalDefinition(document, position);
      const best = localCandidates[0];

      if (best && (best.confidence === 'high' || best.confidence === 'medium')) {
        await vscode.window.showTextDocument(best.uri, {
          selection: best.range,
        });
        this.recordSuccessfulNavigation(document.uri, best.uri, best.symbol.name);
        return true;
      }

      const nativeLocs = await this.findNativeDefinition(document.uri, position);
      if (nativeLocs.length > 0) {
        await vscode.window.showTextDocument(nativeLocs[0].uri, {
          selection: nativeLocs[0].range,
        });
        this.recordSuccessfulNavigation(document.uri, nativeLocs[0].uri);
        return true;
      }

      if (best) {
        await vscode.window.showTextDocument(best.uri, {
          selection: best.range,
        });
        this.recordSuccessfulNavigation(document.uri, best.uri, best.symbol.name);
        return true;
      }
      return false;
    }

    return false;
  }

  private verifyHybridInBackground(
    uri: vscode.Uri,
    position: vscode.Position,
    localTarget: DefinitionCandidate
  ): void {
    Promise.resolve().then(async () => {
      try {
        const nativeLocs = await this.findNativeDefinition(uri, position);
        const { agrees, refinedLocation } = this.reconcile(localTarget, nativeLocs);

        if (!agrees && refinedLocation) {
          // Minimal notification without jarring jump-back
          const jumpAction = 'Jump to Verified Definition';
          const choice = await vscode.window.showInformationMessage(
            `CodePulse: Language server refined definition location for "${localTarget.symbol.name}".`,
            jumpAction
          );
          if (choice === jumpAction) {
            await vscode.window.showTextDocument(refinedLocation.uri, {
              selection: refinedLocation.range,
            });
          }
        }
      } catch (err) {
        logger.debug('Hybrid background verification ignored error', { error: String(err) });
      }
    });
  }

  private recordSuccessfulNavigation(
    fromUri: vscode.Uri,
    toUri: vscode.Uri,
    symbol?: string
  ): void {
    try {
      navigationHistory.record(fromUri.fsPath, toUri.fsPath, symbol);
    } catch {
      // ignore
    }
  }
}

export const definitionEngine = DefinitionEngine.getInstance();
