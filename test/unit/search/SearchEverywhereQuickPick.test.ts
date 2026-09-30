import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  SearchEverywhereQuickPick,
  MODE_BUTTONS,
} from '../../../src/search/ui/SearchEverywhereQuickPick';
import { searchController } from '../../../src/search/SearchController';
import { searchHistoryService } from '../../../src/search/history/SearchHistoryService';
import { SearchResult } from '../../../src/search/models/SearchResult';
import { searchPreviewService } from '../../../src/search/preview/SearchPreviewService';

describe('SearchEverywhereQuickPick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with title, mode buttons, placeholder, and recent queries', () => {
    vi.spyOn(searchHistoryService, 'getRecentQueries').mockReturnValue(['recentQuery']);

    const qp = SearchEverywhereQuickPick.show('all');

    expect(qp.title).toBe('Search Everywhere (All)');
    expect(qp.buttons).toEqual(MODE_BUTTONS);
    expect(qp.placeholder).toContain('Search Everywhere');
    expect(qp.items).toHaveLength(1);
    expect(qp.items[0].label).toContain('recentQuery');

    qp.hide();
  });

  it('switches search mode and updates title when mode buttons are clicked', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(searchController, 'search').mockResolvedValue([]);
      const qp = SearchEverywhereQuickPick.show('all') as any;

      // Click Classes button
      const classBtn = MODE_BUTTONS.find((b) => b.mode === 'class')!;
      qp._fireTriggerButton(classBtn);

      expect(qp.title).toBe('Search Everywhere (Classes)');
      expect(qp.placeholder).toContain('Classes');

      // Click Files button
      const fileBtn = MODE_BUTTONS.find((b) => b.mode === 'file')!;
      qp._fireTriggerButton(fileBtn);

      expect(qp.title).toBe('Search Everywhere (Files)');
      expect(qp.placeholder).toContain('Files');

      // Click Symbols button
      const symbolBtn = MODE_BUTTONS.find((b) => b.mode === 'symbol')!;
      qp._fireTriggerButton(symbolBtn);

      expect(qp.title).toBe('Search Everywhere (Symbols)');
      expect(qp.placeholder).toContain('Symbols');

      qp.hide();
    } finally {
      vi.useRealTimers();
    }
  });

  it('delegates to VS Code command palette when Actions button is triggered', () => {
    const cmdSpy = vi.spyOn(vscode.commands, 'executeCommand');
    const qp = SearchEverywhereQuickPick.show('all') as any;

    const actionBtn = MODE_BUTTONS.find((b) => b.mode === 'action')!;
    qp._fireTriggerButton(actionBtn);

    expect(cmdSpy).toHaveBeenCalledWith('workbench.action.showCommands');
  });

  it('queries searchController and populates items with category icons and open-beside button', async () => {
    vi.useFakeTimers();
    try {
      const mockResults: SearchResult[] = [
        {
          id: 'class:User',
          category: 'class',
          score: 100,
          label: 'User',
          description: 'src/models/User.ts',
          uri: vscode.Uri.file('/src/models/User.ts'),
        } as SearchResult,
        {
          id: 'file:main.ts',
          category: 'file',
          score: 90,
          label: 'main.ts',
          description: 'src/main.ts',
          uri: vscode.Uri.file('/src/main.ts'),
        } as SearchResult,
      ];

      vi.spyOn(searchController, 'search').mockResolvedValue(mockResults);

      const qp = SearchEverywhereQuickPick.show('all') as any;
      qp._fireChangeValue('User');

      await vi.advanceTimersByTimeAsync(200);

      expect(qp.items).toHaveLength(2);
      expect(qp.items[0].label).toContain('$(symbol-class) User');
      expect(qp.items[0].buttons).toBeDefined();
      expect(qp.items[0].buttons[0].tooltip).toBe('Open to Side');

      qp.hide();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens result beside when item button is clicked', async () => {
    const openSpy = vi.spyOn(searchController, 'openResult').mockResolvedValue(undefined);
    const mockResult = {
      id: 'file:test.ts',
      category: 'file',
      score: 100,
      label: 'test.ts',
      uri: vscode.Uri.file('/test.ts'),
    } as SearchResult;

    const qp = SearchEverywhereQuickPick.show('all') as any;

    qp._fireTriggerItemButton({ result: mockResult }, { tooltip: 'Open to Side' });
    await Promise.resolve();

    expect(openSpy).toHaveBeenCalledWith(mockResult, {
      viewColumn: vscode.ViewColumn.Beside,
    });
  });

  it('opens selected result on accept', async () => {
    const openSpy = vi.spyOn(searchController, 'openResult').mockResolvedValue(undefined);
    const mockResult = {
      id: 'file:test.ts',
      category: 'file',
      score: 100,
      label: 'test.ts',
      uri: vscode.Uri.file('/test.ts'),
    } as SearchResult;

    const qp = SearchEverywhereQuickPick.show('all') as any;
    qp.selectedItems = [{ result: mockResult }];

    qp._fireAccept();
    await Promise.resolve();

    expect(openSpy).toHaveBeenCalledWith(mockResult);
  });

  it('triggers code preview on active item change (hover/navigation)', async () => {
    vi.useFakeTimers();
    try {
      const previewSpy = vi.spyOn(searchPreviewService, 'getPreview').mockResolvedValue({
        filePath: '/test.ts',
        startLine: 1,
        endLine: 20,
        highlightLine: 10,
        lines: ['line 1', 'line 2'],
      });
      const showDocSpy = vi.spyOn(vscode.window, 'showTextDocument').mockResolvedValue({} as any);

      const mockResult = {
        id: 'file:test.ts',
        category: 'file',
        score: 100,
        label: 'test.ts',
        line: 10,
        column: 2,
        uri: vscode.Uri.file('/test.ts'),
      } as unknown as SearchResult;

      const qp = SearchEverywhereQuickPick.show('all') as any;
      qp._fireChangeActive([{ result: mockResult }]);

      await vi.advanceTimersByTimeAsync(100);

      expect(previewSpy).toHaveBeenCalledWith(expect.stringContaining('test.ts'), 11, 20);
      expect(showDocSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ preview: true, preserveFocus: true })
      );

      qp.hide();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not open a stale preview after the active item changes', async () => {
    vi.useFakeTimers();
    try {
      let resolveFirstPreview: ((value: any) => void) | undefined;
      vi.spyOn(searchPreviewService, 'getPreview')
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstPreview = resolve;
            })
        )
        .mockResolvedValueOnce({
          filePath: '/second.ts',
          startLine: 1,
          endLine: 10,
          highlightLine: 2,
          lines: ['second'],
        });
      const showDocSpy = vi.spyOn(vscode.window, 'showTextDocument');
      const first = {
        id: 'file:first.ts',
        category: 'file',
        score: 100,
        label: 'first.ts',
        uri: vscode.Uri.file('/first.ts'),
      } as SearchResult;
      const second = {
        id: 'file:second.ts',
        category: 'file',
        score: 99,
        label: 'second.ts',
        uri: vscode.Uri.file('/second.ts'),
      } as SearchResult;

      const qp = SearchEverywhereQuickPick.show('all') as any;
      qp._fireChangeActive([{ result: first }]);
      await vi.advanceTimersByTimeAsync(75);
      qp._fireChangeActive([{ result: second }]);
      await vi.advanceTimersByTimeAsync(75);
      await Promise.resolve();

      resolveFirstPreview?.({
        filePath: '/first.ts',
        startLine: 1,
        endLine: 10,
        highlightLine: 1,
        lines: ['first'],
      });
      await Promise.resolve();
      await Promise.resolve();

      const previewPaths = showDocSpy.mock.calls.map((call) => {
        const documentOrUri = call[0] as vscode.TextDocument | vscode.Uri;
        return 'uri' in documentOrUri ? documentOrUri.uri.fsPath : documentOrUri.fsPath;
      });
      expect(previewPaths.some((filePath) => filePath?.includes('second.ts'))).toBe(true);
      expect(previewPaths.some((filePath) => filePath?.includes('first.ts'))).toBe(false);
      qp.hide();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores the initial editor after an in-flight preview settles on Escape', async () => {
    vi.useFakeTimers();
    try {
      const initialUri = vscode.Uri.file('/initial.ts');
      (vscode.window as any)._setActiveTextEditor({
        document: { uri: initialUri },
        selection: new vscode.Selection(3, 0, 3, 0),
      });
      vi.spyOn(searchPreviewService, 'getPreview').mockResolvedValue({
        filePath: '/preview.ts',
        startLine: 1,
        endLine: 10,
        highlightLine: 1,
        lines: ['preview'],
      });
      let resolveShowPreview: ((value: any) => void) | undefined;
      const showDocSpy = vi.spyOn(vscode.window, 'showTextDocument').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveShowPreview = resolve;
          })
      );
      const qp = SearchEverywhereQuickPick.show('all') as any;
      qp._fireChangeActive([
        {
          result: {
            id: 'file:preview.ts',
            category: 'file',
            score: 100,
            label: 'preview.ts',
            uri: vscode.Uri.file('/preview.ts'),
          } as SearchResult,
        },
      ]);
      await vi.advanceTimersByTimeAsync(75);
      await Promise.resolve();
      qp.hide();
      resolveShowPreview?.({ revealRange: () => {} });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);

      const lastDocumentOrUri = showDocSpy.mock.calls.at(-1)?.[0] as
        vscode.TextDocument | vscode.Uri;
      const lastPath =
        'uri' in lastDocumentOrUri ? lastDocumentOrUri.uri.fsPath : lastDocumentOrUri.fsPath;
      expect(lastPath).toContain('initial.ts');
    } finally {
      (vscode.window as any)._setActiveTextEditor(undefined);
      vi.useRealTimers();
    }
  });
});
