import * as vscode from 'vscode';

export interface IWorkspaceWatcher extends vscode.Disposable {
  startWatching(): void;
  stopWatching(): void;
  flushEvents(): Promise<void>;
}
