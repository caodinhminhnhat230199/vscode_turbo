import * as vscode from 'vscode';
import * as fs from 'fs';
import { WarmupStrategy, WarmupDiscoveryContext } from './WarmupStrategy';
import { WarmupTask, createWarmupTask } from '../models/WarmupTask';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';
import { Disposable } from '../../core/lifecycle/Disposable';

export interface RecentFileEntry {
  fsPath: string;
  lastOpenedAt: number;
}

const STORAGE_KEY = 'vsturbo.recentFiles';
const DEFAULT_MAX_ITEMS = 20;

export class RecentFilesStrategy extends Disposable implements WarmupStrategy {
  public readonly id = 'recent-files';
  public readonly name = 'Recent Files';

  private readonly memento?: vscode.Memento;
  private readonly maxItems: number;
  private recentEntries: RecentFileEntry[] = [];

  constructor(options?: { memento?: vscode.Memento; maxItems?: number }) {
    super();
    this.memento = options?.memento;
    this.maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;

    this.loadFromStorage();

    // Automatically record active editor files
    this.register(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.uri.scheme === 'file') {
          this.recordFile(editor.document.uri);
        }
      })
    );
  }

  public recordFile(uri: vscode.Uri): void {
    if (uri.scheme !== 'file') {
      return;
    }

    const fsPath = uri.fsPath;
    const classification = classifyFile(fsPath);
    // Ignore generated files, build artifacts, dependencies
    if (classification.generated || classification.buildArtifact || classification.dependency) {
      return;
    }

    const norm = fsPath.replace(/\\/g, '/').toLowerCase();
    this.recentEntries = this.recentEntries.filter(
      (e) => e.fsPath.replace(/\\/g, '/').toLowerCase() !== norm
    );

    this.recentEntries.unshift({
      fsPath,
      lastOpenedAt: Date.now(),
    });

    if (this.recentEntries.length > this.maxItems) {
      this.recentEntries = this.recentEntries.slice(0, this.maxItems);
    }

    this.saveToStorage();
  }

  public getRecentEntries(): readonly RecentFileEntry[] {
    return this.recentEntries;
  }

  public clear(): void {
    this.recentEntries = [];
    this.saveToStorage();
  }

  public async discover(context?: WarmupDiscoveryContext): Promise<WarmupTask[]> {
    const tasks: WarmupTask[] = [];

    for (const entry of this.recentEntries) {
      if (context?.cancellationToken?.isCancellationRequested) {
        break;
      }

      if (!fs.existsSync(entry.fsPath)) {
        continue;
      }

      const classification = classifyFile(entry.fsPath);
      if (classification.generated || classification.buildArtifact || classification.dependency) {
        continue;
      }

      tasks.push(
        createWarmupTask({
          uri: vscode.Uri.file(entry.fsPath),
          priority: 3, // P3
          source: 'recentFiles',
          reason: `Recently opened (${new Date(entry.lastOpenedAt).toLocaleTimeString()})`,
        })
      );
    }

    return tasks;
  }

  private loadFromStorage(): void {
    if (!this.memento) {
      return;
    }

    const stored = this.memento.get<RecentFileEntry[]>(STORAGE_KEY);
    if (Array.isArray(stored)) {
      this.recentEntries = stored.filter((item) => typeof item?.fsPath === 'string');
    }
  }

  private saveToStorage(): void {
    if (this.memento) {
      this.memento.update(STORAGE_KEY, this.recentEntries).then(undefined, () => {});
    }
  }
}
