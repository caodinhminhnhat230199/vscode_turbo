import * as vscode from 'vscode';
import { SearchCoordinator, searchCoordinator } from '../engine/SearchCoordinator';
import { SearchResult, SearchCategory } from '../models/SearchResult';

interface SearchQuickPickItem extends vscode.QuickPickItem {
  searchResult: SearchResult;
}

const CATEGORY_ICONS: Record<SearchCategory, string> = {
  file: '$(file)',
  symbol: '$(symbol-field)',
  text: '$(search)',
};

export class SearchQuickPick {
  public static async show(coordinator: SearchCoordinator = searchCoordinator): Promise<void> {
    const quickPick = vscode.window.createQuickPick<SearchQuickPickItem>();
    quickPick.placeholder = 'Search files, symbols, or text (type f:, s:, or t: to filter)...';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    let cancellationSource: vscode.CancellationTokenSource | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    const performSearch = async (val: string) => {
      if (cancellationSource) {
        cancellationSource.cancel();
        cancellationSource.dispose();
      }
      cancellationSource = new vscode.CancellationTokenSource();
      const token = cancellationSource.token;

      let query = val.trim();
      let category: 'all' | 'file' | 'symbol' | 'text' = 'all';

      if (query.startsWith('f:')) {
        category = 'file';
        query = query.slice(2).trim();
      } else if (query.startsWith('s:')) {
        category = 'symbol';
        query = query.slice(2).trim();
      } else if (query.startsWith('t:')) {
        category = 'text';
        query = query.slice(2).trim();
      }

      if (!query) {
        quickPick.items = [];
        quickPick.busy = false;
        return;
      }

      quickPick.busy = true;

      try {
        const results = await coordinator.searchAll(query, {
          category,
          limit: 30,
          cancellationToken: token,
        });

        if (token.isCancellationRequested) {
          return;
        }

        quickPick.items = results.map((r) => {
          const icon = CATEGORY_ICONS[r.category] ?? '$(search)';
          return {
            label: `${icon} ${r.label}`,
            description: r.description,
            detail: r.detail,
            searchResult: r,
          };
        });
      } catch {
        if (!token.isCancellationRequested) {
          quickPick.items = [];
        }
      } finally {
        if (!token.isCancellationRequested) {
          quickPick.busy = false;
        }
      }
    };

    quickPick.onDidChangeValue((value) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      // Quick responsiveness with 50ms typing debounce
      debounceTimer = setTimeout(() => {
        performSearch(value);
      }, 50);
    });

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        const res = selected.searchResult;
        quickPick.hide();

        try {
          const doc = await vscode.workspace.openTextDocument(res.uri);
          const line = (res as any).line ?? 0;
          const col = (res as any).column ?? 0;
          const pos = new vscode.Position(line, col);

          await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(pos, pos),
          });
        } catch {
          // Document opening fallback
        }
      }
    });

    quickPick.onDidHide(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (cancellationSource) {
        cancellationSource.cancel();
        cancellationSource.dispose();
      }
      quickPick.dispose();
    });

    quickPick.show();
  }
}
