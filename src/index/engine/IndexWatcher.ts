import * as vscode from 'vscode';
import { indexEngine } from './IndexEngine';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';
import { logger } from '../../core/logging/Logger';

export class IndexWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private pendingChanges = new Map<string, 'create' | 'change' | 'delete'>();
  private readonly debounceMs = 250;

  public startWatching(): void {
    if (this.disposables.length > 0) {
      return;
    }
    if (typeof vscode.workspace?.createFileSystemWatcher !== 'function') {
      return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');

    this.disposables.push(
      watcher.onDidCreate((uri) => this.handleEvent(uri, 'create')),
      watcher.onDidChange((uri) => this.handleEvent(uri, 'change')),
      watcher.onDidDelete((uri) => this.handleEvent(uri, 'delete')),
      watcher
    );

    logger.info('IndexWatcher registered for workspace files');
  }

  public stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.pendingChanges.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private handleEvent(uri: vscode.Uri, type: 'create' | 'change' | 'delete'): void {
    const fsPath = uri.fsPath.replace(/\\/g, '/');

    // Fast filter ignored or non-source files
    const cls = classifyFile(fsPath);
    if (cls.dependency || cls.buildArtifact || !cls.source) {
      return;
    }

    // Deduplicate / buffer events
    if (type === 'delete') {
      this.pendingChanges.set(fsPath, 'delete');
    } else {
      const existing = this.pendingChanges.get(fsPath);
      if (!existing || existing !== 'delete') {
        this.pendingChanges.set(fsPath, type);
      }
    }

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.flushEvents();
    }, this.debounceMs);
  }

  public async flushEvents(): Promise<void> {
    const events = Array.from(this.pendingChanges.entries());
    this.pendingChanges.clear();

    for (const [filePath, type] of events) {
      if (type === 'delete') {
        await indexEngine.removeFile(filePath);
      } else {
        await indexEngine.indexFile(filePath);
      }
    }
  }

  public dispose(): void {
    this.stopWatching();
  }
}

export const indexWatcher = new IndexWatcher();
