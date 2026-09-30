import * as vscode from 'vscode';

export interface ICancellationManager {
  createTokenSource(id: string, groupId?: string): vscode.CancellationTokenSource;
  getToken(id: string): vscode.CancellationToken | undefined;
  cancel(id: string): boolean;
  cancelGroup(groupId: string): number;
  disposeToken(id: string): void;
  clear(): void;
}
