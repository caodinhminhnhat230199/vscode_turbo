import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { registerCommands } from '../../src/vscode/commands';
import { SearchPanel } from '../../src/search/ui/SearchPanel';
import { SearchEverywhereQuickPick } from '../../src/search/ui/SearchEverywhereQuickPick';
import { projectIndexService } from '../../src/index/ProjectIndexService';
import { searchController } from '../../src/search/SearchController';
import { indexEngine } from '../../src/index/engine/IndexEngine';

describe('Search Everywhere End-to-End Integration', () => {
  let context: vscode.ExtensionContext;
  let tempStorageDir: string;
  const fixturePath = path.resolve(__dirname, '../fixtures/search-workspace');

  beforeEach(async () => {
    SearchPanel.currentPanel?.dispose();
    SearchPanel.currentPanel = undefined;

    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-e2e-'));

    context = {
      subscriptions: [],
      workspaceState: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      globalState: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      extensionUri: vscode.Uri.file(tempStorageDir),
      storageUri: vscode.Uri.file(tempStorageDir),
    } as unknown as vscode.ExtensionContext;

    registerCommands(context);

    indexEngine.configure({
      storageDir: tempStorageDir,
    });
    indexEngine.resume();
    await projectIndexService.initialize([fixturePath]);
  });

  afterEach(async () => {
    SearchPanel.currentPanel?.dispose();
    SearchPanel.currentPanel = undefined;
    for (const sub of context.subscriptions) {
      if (typeof (sub as any).dispose === 'function') {
        (sub as any).dispose();
      }
    }
    await indexEngine.dispose();
    indexEngine.resume();
    try {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    vi.restoreAllMocks();
  });

  it('triggers codePulse.searchEverywhere and opens SearchPanel in all mode when in editorTab mode', async () => {
    (vscode.workspace as any)._setConfig('codePulse.search.useNativeQuickPick', false);
    (vscode.workspace as any)._setConfig('codePulse.search.dialogMode', 'editorTab');

    await vscode.commands.executeCommand('codePulse.searchEverywhere');
    expect(SearchPanel.currentPanel).toBeDefined();

    const panel = (SearchPanel.currentPanel as any).panel;
    expect(panel.webview.html).toContain('Search Everywhere');
    const messages = panel.webview._postedMessages;
    expect(messages.some((m: any) => m.type === 'setMode' && m.mode === 'all')).toBe(true);
  });

  it('triggers mode-specific commands and sets appropriate modes in editorTab mode', async () => {
    (vscode.workspace as any)._setConfig('codePulse.search.useNativeQuickPick', false);
    (vscode.workspace as any)._setConfig('codePulse.search.dialogMode', 'editorTab');

    await vscode.commands.executeCommand('codePulse.searchClasses');
    expect(SearchPanel.currentPanel).toBeDefined();
    let panel = (SearchPanel.currentPanel as any).panel;
    expect(
      panel.webview._postedMessages.some((m: any) => m.type === 'setMode' && m.mode === 'class')
    ).toBe(true);

    await vscode.commands.executeCommand('codePulse.searchFiles');
    panel = (SearchPanel.currentPanel as any).panel;
    expect(
      panel.webview._postedMessages.some((m: any) => m.type === 'setMode' && m.mode === 'file')
    ).toBe(true);

    await vscode.commands.executeCommand('codePulse.searchSymbols');
    panel = (SearchPanel.currentPanel as any).panel;
    expect(
      panel.webview._postedMessages.some((m: any) => m.type === 'setMode' && m.mode === 'symbol')
    ).toBe(true);
  });

  it('executes full pipeline search via SearchController and opens document', async () => {
    const results = await searchController.search({
      query: 'UserService',
      mode: 'all',
      options: {
        workspaceRoots: [fixturePath],
      },
    });

    expect(results.length).toBeGreaterThan(0);
    const target = results.find((r) => r.label.includes('UserService'));
    expect(target).toBeDefined();

    const editor = await searchController.openResult(target!);
    expect(editor).toBeDefined();
    expect(editor?.document.uri.fsPath).toContain('UserService');
  });

  it('defaults to QuickPick floating dialog without opening editor tab', async () => {
    (vscode.workspace as any)._clearConfigs();
    const quickPickSpy = vi
      .spyOn(SearchEverywhereQuickPick, 'show')
      .mockImplementation(() => ({}) as any);

    await vscode.commands.executeCommand('codePulse.searchEverywhere');

    expect(quickPickSpy).toHaveBeenCalledWith('all');
    expect(SearchPanel.currentPanel).toBeUndefined();
  });
});
