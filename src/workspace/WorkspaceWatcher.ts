import * as vscode from 'vscode';
import { IWorkspaceWatcher } from '../core/interfaces/IWorkspaceWatcher';
import { eventBus } from '../core/events/EventBus';
import { ignoreResolver } from './IgnoreResolver';
import { logger } from '../core/logging/Logger';

export interface WorkspaceWatcherOptions {
  debounceMs?: number;
  bulkThreshold?: number;
}

export class WorkspaceWatcher implements IWorkspaceWatcher {
  private static instance: WorkspaceWatcher | null = null;
  private disposables: vscode.Disposable[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private pendingChanges = new Map<string, 'create' | 'change' | 'delete'>();
  private readonly debounceMs: number;
  private readonly bulkThreshold: number;
  private isWatching = false;

  public static getInstance(options?: WorkspaceWatcherOptions): WorkspaceWatcher {
    if (!WorkspaceWatcher.instance) {
      WorkspaceWatcher.instance = new WorkspaceWatcher(options);
    }
    return WorkspaceWatcher.instance;
  }

  constructor(options?: WorkspaceWatcherOptions) {
    this.debounceMs = options?.debounceMs ?? 250;
    this.bulkThreshold = options?.bulkThreshold ?? 50;
  }

  public startWatching(): void {
    if (this.isWatching) {
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

    this.isWatching = true;
    logger.info('Unified WorkspaceWatcher started');
  }

  public stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.pendingChanges.clear();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (err) {
        logger.error('Error disposing watcher', err);
      }
    }
    this.disposables = [];
    this.isWatching = false;
    logger.info('Unified WorkspaceWatcher stopped');
  }

  public handleEvent(uri: vscode.Uri, type: 'create' | 'change' | 'delete'): void {
    const fsPath = uri.fsPath.replace(/\\/g, '/');

    // Filter ignored directories/files early
    if (ignoreResolver.isIgnored(fsPath)) {
      return;
    }

    // Coalesce / deduplicate
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

    if (events.length === 0) {
      return;
    }

    // Event storm / bulk change detection (e.g. npm install, git checkout, branch switch)
    if (events.length >= this.bulkThreshold) {
      logger.info(`Bulk change detected: ${events.length} files modified`);
      eventBus.emit('bulkChangeDetected', {
        fileCount: events.length,
        type: 'bulk_edit',
      });
      return;
    }

    // Publish individual events
    for (const [filePath, type] of events) {
      const uriStr = vscode.Uri.file(filePath).toString();
      if (type === 'create') {
        eventBus.emit('fileCreated', { uri: uriStr, fsPath: filePath });
      } else if (type === 'change') {
        eventBus.emit('fileChanged', { uri: uriStr, fsPath: filePath });
      } else if (type === 'delete') {
        eventBus.emit('fileDeleted', { uri: uriStr, fsPath: filePath });
      }
    }
  }

  public dispose(): void {
    this.stopWatching();
  }
}

export const workspaceWatcher = WorkspaceWatcher.getInstance();
