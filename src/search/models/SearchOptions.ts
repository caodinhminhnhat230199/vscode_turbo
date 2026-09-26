import * as vscode from 'vscode';

export interface SearchOptions {
  limit?: number;
  cancellationToken?: vscode.CancellationToken;
  workspaceRoots?: string[];
  activeFileUri?: vscode.Uri;
  recentFilePaths?: string[];
  includeIgnored?: boolean;
}

export interface TextSearchOptions extends SearchOptions {
  caseSensitive?: boolean;
  isRegex?: boolean;
  wholeWord?: boolean;
  maxFilesizeBytes?: number;
}
