import * as vscode from 'vscode';
import { searchController } from '../SearchController';
import { SearchMode } from '../../core/interfaces/ISearchService';
import { SearchResult } from '../models/SearchResult';
import { searchHistoryService } from '../history/SearchHistoryService';
import { SearchSession } from '../SearchSession';
import { searchPreviewService } from '../preview/SearchPreviewService';

export interface SearchQuickPickItem extends vscode.QuickPickItem {
  result?: SearchResult;
  isModeTab?: boolean;
  mode?: SearchMode;
}

export interface ModeButton extends vscode.QuickInputButton {
  mode: SearchMode | 'action';
}

export const MODE_BUTTONS: ModeButton[] = [
  { iconPath: new vscode.ThemeIcon('layers'), tooltip: 'All (Shift Shift)', mode: 'all' },
  {
    iconPath: new vscode.ThemeIcon('symbol-class'),
    tooltip: 'Classes (Ctrl+N / Cmd+O)',
    mode: 'class',
  },
  {
    iconPath: new vscode.ThemeIcon('file'),
    tooltip: 'Files (Ctrl+Shift+N / Cmd+Shift+O)',
    mode: 'file',
  },
  {
    iconPath: new vscode.ThemeIcon('symbol-method'),
    tooltip: 'Symbols (Ctrl+Alt+Shift+N / Cmd+Alt+O)',
    mode: 'symbol',
  },
  {
    iconPath: new vscode.ThemeIcon('run'),
    tooltip: 'Actions (Ctrl+Shift+A / Cmd+Shift+A)',
    mode: 'action',
  },
  {
    iconPath: new vscode.ThemeIcon('find'),
    tooltip: 'Text (Ctrl+Shift+F / Cmd+Shift+F)',
    mode: 'text',
  },
];

export const OPEN_BESIDE_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('split-horizontal'),
  tooltip: 'Open to Side',
};

export class SearchEverywhereQuickPick {
  public static show(initialMode: SearchMode = 'all'): vscode.QuickPick<SearchQuickPickItem> {
    const quickPick = vscode.window.createQuickPick<SearchQuickPickItem>();
    let currentMode: SearchMode = initialMode;
    let debounceTimer: NodeJS.Timeout | undefined;
    let previewTimer: NodeJS.Timeout | undefined;
    let previewRequestId = 0;
    let disposed = false;
    let previewWasOpened = false;
    const inFlightPreviews = new Set<Promise<void>>();
    let accepted = false;
    const initialEditor = vscode.window.activeTextEditor;
    const initialDocUri = initialEditor?.document.uri;
    const initialSelection = initialEditor?.selection;
    const session = new SearchSession();

    const waitForPreviews = async (): Promise<void> => {
      await Promise.allSettled([...inFlightPreviews]);
    };

    const openPreview = async (result: SearchResult, requestId: number): Promise<void> => {
      const isCurrent = (): boolean => !disposed && requestId === previewRequestId;
      try {
        const targetLine = 'line' in result && typeof result.line === 'number' ? result.line : 0;
        const targetCol =
          'column' in result && typeof result.column === 'number' ? result.column : 0;
        const snippet = await searchPreviewService.getPreview(
          result.uri.fsPath,
          targetLine + 1,
          20
        );
        if (!snippet || !isCurrent()) {
          return;
        }

        const doc = await vscode.workspace.openTextDocument(result.uri);
        if (!isCurrent() || doc.lineCount < 1) {
          return;
        }

        const safeLine = Math.min(Math.max(0, targetLine), doc.lineCount - 1);
        const safeColumn = Math.min(Math.max(0, targetCol), doc.lineAt(safeLine).text.length);
        const pos = new vscode.Position(safeLine, safeColumn);
        const startLine = Math.max(0, snippet.startLine - 1);
        const endLine = Math.min(doc.lineCount - 1, snippet.endLine - 1);
        const revealRange = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, 0)
        );

        if (!isCurrent()) {
          return;
        }
        const editor = await vscode.window.showTextDocument(doc, {
          preview: true,
          preserveFocus: true,
          selection: new vscode.Selection(pos, pos),
        });
        previewWasOpened = true;
        if (isCurrent()) {
          editor.revealRange(revealRange, vscode.TextEditorRevealType.InCenter);
        }
      } catch {
        // Binary, deleted, or otherwise unreadable files are not previewable.
      }
    };

    quickPick.title = SearchEverywhereQuickPick.getTitle(currentMode);
    quickPick.buttons = MODE_BUTTONS;
    quickPick.placeholder = SearchEverywhereQuickPick.getPlaceholder(currentMode);
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    // Show initial recent searches
    const recentQueries = searchHistoryService.getRecentQueries(5);
    if (recentQueries.length > 0) {
      quickPick.items = recentQueries.map((q) => ({
        label: `$(history) ${q}`,
        description: 'Recent search',
      }));
    }

    const updateResults = async (query: string): Promise<void> => {
      const trimmed = query.trim();
      if (!trimmed) {
        session.cancel();
        const recents = searchHistoryService.getRecentQueries(5);
        quickPick.items = recents.map((q) => ({
          label: `$(history) ${q}`,
          description: 'Recent search',
        }));
        return;
      }

      quickPick.busy = true;
      let request: ReturnType<SearchSession['nextRequest']> | undefined;
      try {
        request = session.nextRequest(trimmed, currentMode);
        const results = await searchController.search({
          query: trimmed,
          mode: currentMode,
          sessionId: session.sessionId,
          options: {
            activeFileUri: vscode.window.activeTextEditor?.document.uri,
            workspaceRoots: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [],
            cancellationToken: request.token,
          },
        });

        if (!session.isLatest(request.requestId)) {
          return;
        }

        quickPick.items = results.map((r) => {
          let icon = '$(file)';
          let tag = '[File]';
          if (r.category === 'class') {
            icon = '$(symbol-class)';
            tag = '[Class]';
          } else if (r.category === 'symbol') {
            icon = '$(symbol-method)';
            tag = '[Symbol]';
          } else if (r.category === 'text') {
            icon = '$(find)';
            tag = '[Text]';
          }

          let desc = r.description ? `${tag} ${r.description}` : tag;
          if (r.category === 'text' && r.detail) {
            desc = `${tag} ${r.detail}`;
          }

          let detail = r.detail;
          const lineNum = 'line' in r && typeof (r as any).line === 'number' ? (r as any).line : 0;
          const lineText =
            'lineText' in r && typeof (r as any).lineText === 'string' ? (r as any).lineText : '';
          if (r.category === 'text' && lineText) {
            detail = `Line ${lineNum + 1}: ${lineText.trim()}`;
          }

          return {
            label: `${icon} ${r.label}`,
            description: desc,
            detail,
            result: r,
            buttons: [OPEN_BESIDE_BUTTON],
          };
        });
      } catch (error) {
        if (
          error instanceof vscode.CancellationError ||
          (error as Error)?.name === 'CancellationError'
        ) {
          return;
        }
        vscode.window.showErrorMessage(
          `VS Turbo: Search failed: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        if (request && session.isLatest(request.requestId)) {
          quickPick.busy = false;
        }
      }
    };

    quickPick.onDidChangeActive((activeItems) => {
      const requestId = ++previewRequestId;
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = undefined;
      }

      const active = activeItems[0];
      if (!active?.result?.uri) {
        return;
      }

      const result = active.result;
      previewTimer = setTimeout(() => {
        previewTimer = undefined;
        const task = openPreview(result, requestId);
        inFlightPreviews.add(task);
        void task.finally(() => inFlightPreviews.delete(task));
      }, 75);
    });

    quickPick.onDidChangeValue((value) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void updateResults(value);
      }, 150);
    });

    quickPick.onDidTriggerButton((btn) => {
      const modeBtn = btn as ModeButton;
      if (modeBtn && modeBtn.mode) {
        if (modeBtn.mode === 'action') {
          quickPick.hide();
          void vscode.commands.executeCommand('workbench.action.showCommands');
          return;
        }
        currentMode = modeBtn.mode;
        quickPick.title = SearchEverywhereQuickPick.getTitle(currentMode);
        quickPick.placeholder = SearchEverywhereQuickPick.getPlaceholder(currentMode);
        void updateResults(quickPick.value);
      }
    });

    quickPick.onDidTriggerItemButton(async (e) => {
      if (e.item.result) {
        accepted = true;
        quickPick.hide();
        if (inFlightPreviews.size > 0) {
          await waitForPreviews();
        }
        await searchController.openResult(e.item.result, {
          viewColumn: vscode.ViewColumn.Beside,
        });
      }
    });

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (!selected) {
        return;
      }

      if (selected.result) {
        accepted = true;
        quickPick.hide();
        if (inFlightPreviews.size > 0) {
          await waitForPreviews();
        }
        await searchController.openResult(selected.result);
      } else if (selected.label.startsWith('$(history)')) {
        const queryText = selected.label.replace('$(history) ', '');
        quickPick.value = queryText;
        void updateResults(queryText);
      }
    });

    quickPick.onDidHide(() => {
      disposed = true;
      previewRequestId++;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (previewTimer) {
        clearTimeout(previewTimer);
      }
      const shouldRestoreInitialEditor =
        !accepted &&
        initialDocUri !== undefined &&
        initialEditor !== undefined &&
        (previewWasOpened || inFlightPreviews.size > 0);
      if (shouldRestoreInitialEditor) {
        void waitForPreviews().then(async () => {
          if (!previewWasOpened) {
            return;
          }
          const doc = await vscode.workspace.openTextDocument(initialDocUri);
          await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: true,
            selection: initialSelection,
          });
        });
      }
      session.dispose();
      quickPick.dispose();
    });

    quickPick.show();
    return quickPick;
  }

  public static getTitle(mode: SearchMode): string {
    const labels: Record<SearchMode, string> = {
      all: 'All',
      class: 'Classes',
      file: 'Files',
      symbol: 'Symbols',
      text: 'Text',
    };
    return `Search Everywhere (${labels[mode] ?? 'All'})`;
  }

  public static getPlaceholder(mode: SearchMode): string {
    switch (mode) {
      case 'class':
        return 'Search Classes & Types... (type:class)';
      case 'file':
        return 'Search Files by Name or Path... (type:file)';
      case 'symbol':
        return 'Search Symbols & Methods... (type:symbol)';
      case 'text':
        return 'Search Text in Workspace via ripgrep... (type:text)';
      case 'all':
      default:
        return 'Search Everywhere (All, Classes, Files, Symbols, Text)...';
    }
  }
}
