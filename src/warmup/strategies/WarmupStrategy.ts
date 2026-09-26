import * as vscode from 'vscode';
import { WarmupTask } from '../models/WarmupTask';

export interface WarmupDiscoveryContext {
  workspaceFolders?: readonly vscode.WorkspaceFolder[];
  cancellationToken?: vscode.CancellationToken;
}

export interface WarmupStrategy {
  readonly id: string;
  readonly name: string;
  discover(context?: WarmupDiscoveryContext): Promise<WarmupTask[]>;
}
