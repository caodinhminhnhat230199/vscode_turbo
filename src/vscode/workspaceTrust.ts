import * as vscode from 'vscode';

/**
 * Checks whether the current VS Code workspace is trusted.
 * When untrusted, external process execution (ripgrep, git CLI) should be disabled.
 */
export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted !== false;
}
