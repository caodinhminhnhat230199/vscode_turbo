import * as vscode from 'vscode';
import { SearchMode } from '../../core/interfaces/ISearchService';
import { SearchResult } from '../models/SearchResult';
import { SearchController, searchController } from '../SearchController';
import { SearchEverywhereQuickPick } from './SearchEverywhereQuickPick';
import { searchPreviewService } from '../preview/SearchPreviewService';
import {
  parseWebviewMessage,
  SearchResultViewModel,
  WebviewToExtensionMessage,
} from './SearchPanelProtocol';
import { getSearchWebviewContent } from './SearchPanelHtml';
import { logger } from '../../core/logging/Logger';
import { searchHistoryService } from '../history/SearchHistoryService';
import { eventBus } from '../../core/events/EventBus';

export class SearchPanel {
  public static currentPanel: SearchPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly controller: SearchController;
  private disposables: vscode.Disposable[] = [];
  private currentResults = new Map<string, SearchResult>();
  private searchCts: vscode.CancellationTokenSource | null = null;
  private readonly sessionId = `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private disposed = false;

  public static async show(
    extensionUri?: vscode.Uri,
    initialMode: SearchMode = 'all',
    controller: SearchController = searchController
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('vsturbo.search');
    const legacyConfig = vscode.workspace.getConfiguration('codePulse.search');
    const dialogMode =
      config.get<string>('dialogMode') ?? legacyConfig.get<string>('dialogMode', 'floatingDialog');
    const useNative =
      dialogMode === 'floatingDialog' &&
      (config.get<boolean>('useNativeQuickPick') ??
        legacyConfig.get<boolean>('useNativeQuickPick', true));

    if (useNative) {
      SearchEverywhereQuickPick.show(initialMode);
      return;
    }

    if (SearchPanel.currentPanel) {
      SearchPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      SearchPanel.currentPanel.panel.webview.postMessage({
        type: 'setMode',
        mode: initialMode,
      });
      return;
    }

    try {
      const panel = vscode.window.createWebviewPanel(
        'vsturbo.searchEverywhere',
        'Search Everywhere',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: extensionUri ? [extensionUri] : [],
        }
      );

      SearchPanel.currentPanel = new SearchPanel(panel, controller, initialMode);
    } catch (err) {
      logger.warn('[SearchPanel] Failed to create webview, falling back to QuickPick', {
        error: String(err),
      });
      SearchEverywhereQuickPick.show(initialMode);
    }
  }

  constructor(
    panel: vscode.WebviewPanel,
    controller: SearchController,
    initialMode: SearchMode = 'all'
  ) {
    this.panel = panel;
    this.controller = controller;

    this.panel.webview.html = getSearchWebviewContent(this.panel.webview, initialMode);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => this.handleRawMessage(message),
      null,
      this.disposables
    );

    const unsubscribeIndex = eventBus.on('indexUpdated', () => {
      void this.panel.webview.postMessage({
        type: 'setReadiness',
        state: this.controller.getReadiness(),
      });
    });
    this.disposables.push({ dispose: unsubscribeIndex });

    // Initial state notifications
    this.panel.webview.postMessage({
      type: 'setReadiness',
      state: this.controller.getReadiness(),
    });
    this.panel.webview.postMessage({
      type: 'setMode',
      mode: initialMode,
    });
    this.postHistory();
  }

  private async handleRawMessage(input: unknown): Promise<void> {
    const message = parseWebviewMessage(input);
    if (!message) {
      logger.warn('[SearchPanel] Ignored invalid webview message');
      return;
    }
    await this.handleMessage(message);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'search':
        await this.handleSearch(message);
        break;
      case 'openResult':
        await this.handleOpenResult(message.id, message.toSide);
        break;
      case 'requestPreview':
        await this.handleRequestPreview(message.id);
        break;
      case 'getHistory':
        this.postHistory();
        break;
      case 'changeMode':
        this.panel.webview.postMessage({ type: 'setMode', mode: message.mode });
        break;
      case 'dismiss':
        this.dispose();
        break;
    }
  }

  private async handleSearch(
    msg: Extract<WebviewToExtensionMessage, { type: 'search' }>
  ): Promise<void> {
    this.searchCts?.cancel();
    this.searchCts = new vscode.CancellationTokenSource();
    const token = this.searchCts.token;

    const t0 = performance.now();
    try {
      const results = await this.controller.search({
        query: msg.query,
        mode: msg.mode,
        sessionId: this.sessionId,
        options: {
          cancellationToken: token,
          kindFilter: msg.filters?.kind,
          pathFilter: msg.filters?.path,
          extFilter: msg.filters?.ext,
          langFilter: msg.filters?.lang,
        },
      });

      if (!token.isCancellationRequested) {
        this.currentResults.clear();
        for (const r of results) {
          this.currentResults.set(r.id, r);
        }

        const viewModels = results.map((result) => this.toViewModel(result));
        this.panel.webview.postMessage({
          type: 'setResults',
          query: msg.query,
          mode: msg.mode,
          seq: msg.seq,
          results: viewModels,
          executionMs: performance.now() - t0,
          total: results.length,
        });
      }
    } catch (error) {
      if (!token.isCancellationRequested) {
        logger.error('[SearchPanel] Search failed', error);
        this.panel.webview.postMessage({
          type: 'setError',
          message: 'Search failed. Check the VS Turbo output for details.',
        });
      }
    }
  }

  private async handleOpenResult(id: string, toSide?: boolean): Promise<void> {
    const item = this.currentResults.get(id);
    if (!item) {
      return;
    }

    try {
      if (toSide) {
        const doc = await vscode.workspace.openTextDocument(item.uri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        if ('line' in item && typeof item.line === 'number') {
          const line = Math.max(0, item.line);
          const col =
            'column' in item && typeof item.column === 'number' ? Math.max(0, item.column) : 0;
          const pos = new vscode.Position(line, col);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }
      } else {
        await this.controller.openResult(item);
      }
    } finally {
      this.dispose();
    }
  }

  private async handleRequestPreview(id: string): Promise<void> {
    const item = this.currentResults.get(id);
    if (!item) {
      return;
    }
    try {
      const targetLine = 'line' in item && typeof item.line === 'number' ? item.line + 1 : 1;
      const snippet = await searchPreviewService.getPreview(item.uri.fsPath, targetLine, 15);
      if (!this.disposed) {
        await this.panel.webview.postMessage({ type: 'setPreview', id, snippet });
      }
    } catch (error) {
      logger.warn('[SearchPanel] Preview failed', { id, error: String(error) });
      if (!this.disposed) {
        await this.panel.webview.postMessage({ type: 'setPreview', id, snippet: undefined });
      }
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    SearchPanel.currentPanel = undefined;
    this.searchCts?.cancel();
    this.searchCts?.dispose();
    this.searchCts = null;
    this.currentResults.clear();

    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }

    try {
      this.panel.dispose();
    } catch {
      // already disposed
    }
  }

  private postHistory(): void {
    this.panel.webview.postMessage({
      type: 'setHistory',
      items: searchHistoryService.getRecentQueries(),
    });
  }

  private toViewModel(result: SearchResult): SearchResultViewModel {
    return {
      ...result,
      uri: result.uri.toString(),
      fsPath: result.uri.fsPath,
    };
  }
}
