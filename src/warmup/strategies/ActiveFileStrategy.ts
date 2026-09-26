import * as vscode from 'vscode';
import { WarmupStrategy, WarmupDiscoveryContext } from './WarmupStrategy';
import { WarmupTask, createWarmupTask } from '../models/WarmupTask';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';

export class ActiveFileStrategy implements WarmupStrategy {
  public readonly id = 'active-file';
  public readonly name = 'Active File';

  public async discover(_context?: WarmupDiscoveryContext): Promise<WarmupTask[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return [];
    }

    const uri = editor.document.uri;
    const classification = classifyFile(uri.fsPath);
    if (classification.buildArtifact || classification.dependency) {
      return [];
    }

    return [
      createWarmupTask({
        uri,
        priority: 0, // P0 highest
        source: 'activeFile',
        reason: 'Active editor document',
      }),
    ];
  }
}
