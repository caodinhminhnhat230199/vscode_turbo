import * as vscode from 'vscode';

export type WarmupSource =
  | 'activeFile'
  | 'entryPoint'
  | 'gitChanged'
  | 'recentFiles'
  | 'manual'
  | 'dependency'
  | 'predictive';

export interface WarmupTask {
  id: string;
  uri: vscode.Uri;
  priority: number; // 0 (highest, e.g. active file) to 10 (lowest)
  source: WarmupSource;
  reason: string;
  addedAt: number;
}

export function createWarmupTask(params: {
  uri: vscode.Uri;
  priority: number;
  source: WarmupSource;
  reason: string;
  id?: string;
  addedAt?: number;
}): WarmupTask {
  const normPath = params.uri.fsPath.replace(/\\/g, '/');
  return {
    id: params.id ?? `${params.source}:${normPath}`,
    uri: params.uri,
    priority: params.priority,
    source: params.source,
    reason: params.reason,
    addedAt: params.addedAt ?? Date.now(),
  };
}
