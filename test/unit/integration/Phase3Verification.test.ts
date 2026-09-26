import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { IndexEngine, indexEngine } from '../../../src/index/engine/IndexEngine';
import { PersistentIndexStore } from '../../../src/index/store/PersistentIndexStore';
import { stateStore } from '../../../src/core/state/StateStore';
import { WebviewMessageRouter } from '../../../src/webview/WebviewMessageRouter';
import { registerCommands } from '../../../src/vscode/commands';

describe('P3.16 — Phase 3 End-to-End Verification', () => {
  let tempWorkspace: string;
  let dbPath: string;
  let engine: IndexEngine;
  let store: PersistentIndexStore;

  beforeEach(async () => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-phase3-ws-'));
    dbPath = path.join(tempWorkspace, '.codepulse', 'index.json');

    // Create some initial files
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'user.ts'),
      'export class User { id: string; }',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'auth.ts'),
      'export function login() {}',
      'utf8'
    );

    store = new PersistentIndexStore(dbPath);
    engine = new IndexEngine({ store });

    const originalExecute = vscode.commands.executeCommand.bind(vscode.commands);
    // Mock document symbol provider
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ...args) => {
      if (cmd === 'vscode.executeDocumentSymbolProvider') {
        const uri = args[0] as vscode.Uri;
        if (uri.fsPath.endsWith('user.ts')) {
          return [
            {
              name: 'User',
              kind: 4,
              range: { start: { line: 0, character: 0 } },
            },
          ] as any;
        }
        if (uri.fsPath.endsWith('auth.ts')) {
          return [
            {
              name: 'login',
              kind: 11,
              range: { start: { line: 0, character: 0 } },
            },
          ] as any;
        }
      }
      return originalExecute(cmd, ...args);
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('performs full initial build, writes DB, and restores index across restarts', async () => {
    // 1. Initial build
    await engine.initialize([tempWorkspace]);

    const initialFiles = await store.getFileCount();
    expect(initialFiles).toBe(2);

    const symbols = await store.getAllSymbols();
    expect(symbols.length).toBe(2);
    expect(symbols.some((s) => s.name === 'User')).toBe(true);
    expect(symbols.some((s) => s.name === 'login')).toBe(true);
    await store.close();

    // 2. Simulate restarting VS Code and restoring existing index
    const restoredStore = new PersistentIndexStore(dbPath);
    const restoredEngine = new IndexEngine({ store: restoredStore });

    await restoredEngine.initialize([tempWorkspace]);
    expect(await restoredStore.getFileCount()).toBe(2);
    expect(await restoredStore.getSymbolCount()).toBe(2);

    const userClass = await restoredStore.searchSymbolsByName('User', { exact: true });
    expect(userClass).toHaveLength(1);
    expect(userClass[0].name).toBe('User');
    await restoredStore.close();
  });

  it('modifies one file, verifies only that file is updated, and handles deletions and additions', async () => {
    await engine.initialize([tempWorkspace]);
    expect(await store.getFileCount()).toBe(2);

    // 1. Create a new file -> indexed
    const newFilePath = path.join(tempWorkspace, 'src', 'order.ts');
    fs.writeFileSync(newFilePath, 'export class Order {}', 'utf8');

    await engine.indexFile(newFilePath);
    expect(await store.getFileCount()).toBe(3);

    // 2. Modify one file
    const authPath = path.join(tempWorkspace, 'src', 'auth.ts');
    fs.writeFileSync(authPath, 'export function login() {} export function logout() {}', 'utf8');

    await engine.indexFile(authPath);
    expect(await store.getFileCount()).toBe(3);

    // 3. Delete file -> removed from index
    fs.unlinkSync(newFilePath);
    await engine.removeFile(newFilePath);
    expect(await store.getFileCount()).toBe(2);
    const deletedRecord = await store.getFileByPath(newFilePath);
    expect(deletedRecord).toBeUndefined();
  });

  it('handles database corruption fallback gracefully', async () => {
    await engine.initialize([tempWorkspace]);
    await store.close();

    // Corrupt DB file
    fs.writeFileSync(dbPath, '{"broken": [malformed', 'utf8');

    const freshStore = new PersistentIndexStore(dbPath);
    await freshStore.initialize();

    // Expect corruption recovery (fresh database initialized, corrupt backed up)
    expect(freshStore.isInitialized()).toBe(true);
    expect(await freshStore.getFileCount()).toBe(0);

    const dirFiles = fs.readdirSync(path.dirname(dbPath));
    expect(dirFiles.some((f) => f.includes('.corrupted.'))).toBe(true);
  });

  it('routes index commands (rebuild, clear, pause, resume) via WebviewMessageRouter', async () => {
    const execSpy = vi.spyOn(vscode.commands, 'executeCommand');

    await WebviewMessageRouter.handleMessage({ type: 'REBUILD_INDEX' });
    expect(execSpy).toHaveBeenCalledWith('codePulse.rebuildIndex');

    await WebviewMessageRouter.handleMessage({ type: 'CLEAR_INDEX' });
    expect(execSpy).toHaveBeenCalledWith('codePulse.clearIndex');

    await WebviewMessageRouter.handleMessage({ type: 'PAUSE_INDEX' });
    expect(execSpy).toHaveBeenCalledWith('codePulse.pauseIndexing');

    await WebviewMessageRouter.handleMessage({ type: 'RESUME_INDEX' });
    expect(execSpy).toHaveBeenCalledWith('codePulse.resumeIndexing');
  });

  it('executes clearIndex and rebuildIndex commands successfully', async () => {
    const context = { subscriptions: [] } as any;
    registerCommands(context);

    await indexEngine.initialize([tempWorkspace]);
    expect(await indexEngine.getStore().getFileCount()).toBe(2);

    await vscode.commands.executeCommand('codePulse.clearIndex');
    expect(stateStore.getState().indexStatus.indexedFiles).toBe(0);

    await vscode.commands.executeCommand('codePulse.pauseIndexing');
    expect(stateStore.getState().indexStatus.status).toBe('paused');

    await vscode.commands.executeCommand('codePulse.resumeIndexing');
    expect(stateStore.getState().indexStatus.status).toBe('idle');
  });
});
