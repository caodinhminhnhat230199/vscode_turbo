import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../../src/extension';
import { indexEngine } from '../../../src/index/engine/IndexEngine';

class MockExtensionContext implements Partial<vscode.ExtensionContext> {
  public subscriptions: { dispose(): any }[] = [];
  public extensionUri = { fsPath: '/test/path' } as any;
  public workspaceState = {
    get: () => undefined,
    update: async () => {},
    keys: () => [],
  } as any;
  public globalState = {
    get: () => undefined,
    update: async () => {},
    keys: () => [],
    setKeysForSync: () => {},
  } as any;
}

describe('Extension Activation Baseline', () => {
  afterEach(() => {
    (
      vscode.workspace as unknown as {
        _setWorkspaceFolders: (folders: undefined) => void;
      }
    )._setWorkspaceFolders(undefined);
  });

  it('activates synchronously without blocking (< 50ms)', () => {
    const context = new MockExtensionContext() as vscode.ExtensionContext;
    const t0 = performance.now();
    activate(context);
    const durationMs = performance.now() - t0;

    // Verify sub-50ms activation target
    expect(durationMs).toBeLessThan(50);
    // Verify subscriptions registered (logger, config, commands, status bar, webview)
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(4);
  });

  it('initializes the shared index with persistent workspace storage', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-activation-workspace-'));
    const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-activation-storage-'));
    fs.writeFileSync(
      path.join(workspacePath, 'indexed.ts'),
      'export const indexed = true;',
      'utf8'
    );

    (
      vscode.workspace as unknown as {
        _setWorkspaceFolders: (
          folders: Array<{ uri: vscode.Uri; name: string; index: number }>
        ) => void;
      }
    )._setWorkspaceFolders([{ uri: vscode.Uri.file(workspacePath), name: 'workspace', index: 0 }]);

    const context = new MockExtensionContext() as vscode.ExtensionContext;
    Object.assign(context, { storageUri: vscode.Uri.file(storagePath) });
    activate(context);

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(indexEngine.getStore().isInitialized()).toBe(true);
    expect(await indexEngine.getStore().getFileCount()).toBe(1);

    await indexEngine.dispose();
    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(storagePath, { recursive: true, force: true });
  });
});
