import * as vscode from 'vscode';
import { WarmupStrategy, WarmupDiscoveryContext } from './WarmupStrategy';
import { WarmupTask, createWarmupTask } from '../models/WarmupTask';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';

const ENTRY_GLOBS = [
  // Dart / Flutter entrypoints
  '**/lib/main.dart',
  '**/lib/main_*.dart',
  '**/bin/main.dart',
  // TypeScript / Node entrypoints
  '**/src/index.{ts,tsx,js,jsx}',
  '**/src/main.{ts,tsx,js,jsx}',
  '**/src/app.{ts,tsx,js,jsx}',
  '**/src/server.{ts,tsx,js,jsx}',
  '**/index.{ts,tsx,js,jsx}',
  '**/main.{ts,tsx,js,jsx}',
  '**/app.{ts,tsx,js,jsx}',
  '**/server.{ts,tsx,js,jsx}',
];

const EXCLUDE_GLOB = '{**/node_modules/**,**/.git/**,**/build/**,**/.dart_tool/**,**/dist/**}';

export class EntryPointStrategy implements WarmupStrategy {
  public readonly id = 'entry-point';
  public readonly name = 'Entry Point';

  public async discover(context?: WarmupDiscoveryContext): Promise<WarmupTask[]> {
    const tasks: WarmupTask[] = [];
    const seenPaths = new Set<string>();

    for (const pattern of ENTRY_GLOBS) {
      if (context?.cancellationToken?.isCancellationRequested) {
        break;
      }

      try {
        const uris = await vscode.workspace.findFiles(
          pattern,
          EXCLUDE_GLOB,
          20,
          context?.cancellationToken
        );

        for (const uri of uris) {
          const norm = uri.fsPath.replace(/\\/g, '/').toLowerCase();
          if (seenPaths.has(norm)) {
            continue;
          }

          const classification = classifyFile(uri.fsPath);
          if (classification.buildArtifact || classification.dependency) {
            continue;
          }

          seenPaths.add(norm);
          tasks.push(
            createWarmupTask({
              uri,
              priority: 1, // P1
              source: 'entryPoint',
              reason: 'Application entrypoint',
            })
          );
        }
      } catch {
        // Continue search if one pattern fails
      }
    }

    return tasks;
  }
}
