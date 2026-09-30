import * as vscode from 'vscode';

export interface WorkspaceScanResult {
  files: string[];
  totalCount: number;
  durationMs: number;
}

export interface WorkspaceScanOptions {
  token?: vscode.CancellationToken;
  maxFiles?: number;
  respectGitIgnore?: boolean;
}

export interface IWorkspaceScanner {
  scan(roots: string[], options?: WorkspaceScanOptions): Promise<WorkspaceScanResult>;
  cancel(): void;
}
