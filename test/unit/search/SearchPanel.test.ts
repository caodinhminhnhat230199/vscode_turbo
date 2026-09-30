import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { SearchPanel } from '../../../src/search/ui/SearchPanel';
import { SearchController } from '../../../src/search/SearchController';
import { SearchEverywhereQuickPick } from '../../../src/search/ui/SearchEverywhereQuickPick';
import { SearchResult } from '../../../src/search/models/SearchResult';
import { searchPreviewService } from '../../../src/search/preview/SearchPreviewService';
import { Script } from 'vm';

describe('SearchPanel (Search Everywhere Webview)', () => {
  let mockController: SearchController;

  beforeEach(() => {
    SearchPanel.currentPanel?.dispose();
    SearchPanel.currentPanel = undefined;
    (vscode.workspace as any)._setConfig('vsturbo.search.useNativeQuickPick', false);
    (vscode.workspace as any)._setConfig('vsturbo.search.dialogMode', 'editorTab');

    mockController = {
      search: vi.fn().mockResolvedValue([
        {
          id: 'file:test.ts',
          category: 'file',
          score: 100,
          uri: vscode.Uri.file('/workspace/test.ts'),
          label: 'test.ts',
          fileName: 'test.ts',
          fsPath: '/workspace/test.ts',
          relativePath: 'test.ts',
        } as SearchResult,
      ]),
      openResult: vi.fn().mockResolvedValue(undefined),
      getReadiness: vi.fn().mockReturnValue('ready'),
    } as unknown as SearchController;
  });

  afterEach(() => {
    SearchPanel.currentPanel?.dispose();
    SearchPanel.currentPanel = undefined;
    (vscode.workspace as any)._clearConfigs();
    vi.restoreAllMocks();
  });

  it('creates webview panel and sends initial readiness and mode', async () => {
    await SearchPanel.show(undefined, 'class', mockController);
    expect(SearchPanel.currentPanel).toBeDefined();

    const panel = (SearchPanel.currentPanel as any).panel;
    expect(panel.webview.html).toContain('Search Everywhere');
    expect(panel.webview.html).toContain('Content-Security-Policy');
    expect(panel.webview.html).not.toContain("script-src 'unsafe-inline'");
    expect(panel.webview.html).toContain('data-mode="text"');
    expect(panel.webview.html).not.toContain('data-mode="action"');
    expect(panel.webview.html).toContain('role="listbox"');
    const script = panel.webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Script(script)).not.toThrow();

    const messages = panel.webview._postedMessages;
    expect(messages.some((m: any) => m.type === 'setReadiness' && m.state === 'ready')).toBe(true);
    expect(messages.some((m: any) => m.type === 'setMode' && m.mode === 'class')).toBe(true);
  });

  it('handles search message and posts setResults with matching sequence', async () => {
    await SearchPanel.show(undefined, 'all', mockController);
    const panel = (SearchPanel.currentPanel as any).panel;

    await panel.webview._simulateMessage({
      type: 'search',
      query: 'test',
      mode: 'all',
      seq: 1,
    });

    expect(mockController.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test',
        mode: 'all',
      })
    );

    const messages = panel.webview._postedMessages;
    const resultMsg = messages.find((m: any) => m.type === 'setResults' && m.seq === 1);
    expect(resultMsg).toBeDefined();
    expect(resultMsg.results).toHaveLength(1);
    expect(resultMsg.results[0].label).toBe('test.ts');
    expect(resultMsg.results[0].fsPath).toBe('/workspace/test.ts');
    expect(resultMsg.results[0].uri).toBe('file:///workspace/test.ts');
  });

  it('rejects invalid messages and resolves preview paths from known results', async () => {
    (mockController.search as any).mockResolvedValueOnce([
      {
        id: 'text:test.ts:0:0',
        category: 'text',
        score: 100,
        uri: vscode.Uri.file('/workspace/test.ts'),
        label: 'const test = true;',
        line: 0,
        column: 0,
        lineText: 'const test = true;',
        matchLength: 4,
      } as SearchResult,
    ]);
    const previewSpy = vi.spyOn(searchPreviewService, 'getPreview').mockResolvedValue(undefined);

    await SearchPanel.show(undefined, 'text', mockController);
    const panel = (SearchPanel.currentPanel as any).panel;
    await panel.webview._simulateMessage({ type: 'search', query: 'test', mode: 'text', seq: 1 });

    await panel.webview._simulateMessage({
      type: 'requestPreview',
      id: 'text:test.ts:0:0',
      filePath: 'C:\\Users\\secret.txt',
    });
    expect(previewSpy).not.toHaveBeenCalled();

    await panel.webview._simulateMessage({ type: 'requestPreview', id: 'text:test.ts:0:0' });
    expect(previewSpy).toHaveBeenCalledWith('/workspace/test.ts', 1, 15);
  });

  it('returns an unavailable preview when reading the result fails', async () => {
    vi.spyOn(searchPreviewService, 'getPreview').mockRejectedValue(new Error('deleted'));
    await SearchPanel.show(undefined, 'all', mockController);
    const searchPanel = SearchPanel.currentPanel as any;
    const panel = searchPanel.panel;
    await searchPanel.handleRawMessage({ type: 'search', query: 'test', mode: 'all', seq: 1 });

    await expect(
      searchPanel.handleRawMessage({ type: 'requestPreview', id: 'file:test.ts' })
    ).resolves.toBeUndefined();

    expect(panel.webview._postedMessages.at(-1)).toEqual({
      type: 'setPreview',
      id: 'file:test.ts',
      snippet: undefined,
    });
  });

  it('uses mouseenter without a mousemove rerender loop for result previews', async () => {
    await SearchPanel.show(undefined, 'all', mockController);
    const html = (SearchPanel.currentPanel as any).panel.webview.html;

    expect(html).toContain("row.addEventListener('mouseenter'");
    expect(html).not.toContain("row.addEventListener('mousemove'");
    expect(html).not.toContain("row.addEventListener('dblclick'");
  });

  it('handles openResult and disposes the panel', async () => {
    await SearchPanel.show(undefined, 'all', mockController);
    const panel = (SearchPanel.currentPanel as any).panel;

    // Search first so item is stored in currentResults
    await panel.webview._simulateMessage({
      type: 'search',
      query: 'test',
      mode: 'all',
      seq: 1,
    });

    await panel.webview._simulateMessage({
      type: 'openResult',
      id: 'file:test.ts',
    });

    expect(mockController.openResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'file:test.ts',
      })
    );
    expect(panel.disposed).toBe(true);
  });

  it('falls back to QuickPick when native setting is enabled', async () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue?: any) => {
        if (key === 'useNativeQuickPick') return true;
        if (key === 'dialogMode') return 'floatingDialog';
        return defaultValue;
      },
    } as any);

    const quickPickSpy = vi
      .spyOn(SearchEverywhereQuickPick, 'show')
      .mockImplementation(() => ({}) as any);

    await SearchPanel.show(undefined, 'symbol', mockController);

    expect(quickPickSpy).toHaveBeenCalledWith('symbol');
    expect(SearchPanel.currentPanel).toBeUndefined();
  });

  it('falls back to QuickPick when webview creation throws', async () => {
    vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(() => {
      throw new Error('Webview creation failed in headless environment');
    });

    const quickPickSpy = vi
      .spyOn(SearchEverywhereQuickPick, 'show')
      .mockImplementation(() => ({}) as any);

    await SearchPanel.show(undefined, 'file', mockController);

    expect(quickPickSpy).toHaveBeenCalledWith('file');
  });
});
