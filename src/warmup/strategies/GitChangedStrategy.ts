import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WarmupStrategy, WarmupDiscoveryContext } from './WarmupStrategy';
import { WarmupTask, createWarmupTask } from '../models/WarmupTask';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';
import { logger } from '../../core/logging/Logger';
import { isWorkspaceTrusted } from '../../vscode/workspaceTrust';

const execFileAsync = promisify(execFile);

export class GitChangedStrategy implements WarmupStrategy {
  public readonly id = 'git-changed';
  public readonly name = 'Git Changed Files';

  public async discover(context?: WarmupDiscoveryContext): Promise<WarmupTask[]> {
    const tasks: WarmupTask[] = [];
    const seenPaths = new Set<string>();

    if (!isWorkspaceTrusted()) {
      logger.info('Workspace is untrusted. Skipping Git integration.');
      return tasks;
    }

    // 1. Try VS Code Git Extension API
    const gitApiTasks = await this.discoverViaGitExtension(seenPaths);
    if (gitApiTasks.length > 0) {
      return gitApiTasks;
    }

    const workspaceFolders = context?.workspaceFolders ?? vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      return [];
    }

    // 2. Safe Fallback: child_process.execFile with argument array
    for (const folder of workspaceFolders) {
      if (context?.cancellationToken?.isCancellationRequested) {
        break;
      }

      const folderTasks = await this.discoverViaGitCli(folder.uri.fsPath, seenPaths);
      tasks.push(...folderTasks);
    }

    return tasks;
  }

  private async discoverViaGitExtension(seenPaths: Set<string>): Promise<WarmupTask[]> {
    const tasks: WarmupTask[] = [];
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        return [];
      }

      if (!gitExt.isActive) {
        await gitExt.activate();
      }

      const git = gitExt.exports?.getAPI?.(1);
      if (!git || !git.repositories || git.repositories.length === 0) {
        return [];
      }

      for (const repo of git.repositories) {
        const changes = [
          ...(repo.state.workingTreeChanges || []),
          ...(repo.state.indexChanges || []),
          ...(repo.state.untrackedChanges || []),
        ];

        for (const change of changes) {
          if (!change?.uri || change.uri.scheme !== 'file') {
            continue;
          }

          const norm = change.uri.fsPath.replace(/\\/g, '/').toLowerCase();
          if (seenPaths.has(norm)) {
            continue;
          }

          const classification = classifyFile(change.uri.fsPath);
          if (classification.buildArtifact || classification.dependency) {
            continue;
          }

          seenPaths.add(norm);
          tasks.push(
            createWarmupTask({
              uri: change.uri,
              priority: 2, // P2
              source: 'gitChanged',
              reason: 'Git modified/untracked file',
            })
          );
        }
      }
    } catch (err) {
      logger.debug('Failed to query git extension API', { error: String(err) });
    }

    return tasks;
  }

  private async discoverViaGitCli(
    folderPath: string,
    seenPaths: Set<string>
  ): Promise<WarmupTask[]> {
    const tasks: WarmupTask[] = [];

    // Check if .git directory exists
    const gitDir = path.join(folderPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return [];
    }

    try {
      // Safe execFile with direct binary and argument array - NO shell interpolation
      const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-uall'], {
        cwd: folderPath,
        timeout: 5000,
        windowsHide: true,
      });

      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 4) {
          continue;
        }

        // Status format: XY <path> or XY <path1> -> <path2>
        let relPath = trimmed.substring(3).trim();
        if (relPath.includes(' -> ')) {
          relPath = relPath.split(' -> ')[1].trim();
        }

        // Strip quotes if git quoted the path
        if (relPath.startsWith('"') && relPath.endsWith('"')) {
          relPath = relPath.slice(1, -1);
        }

        const fullPath = path.resolve(folderPath, relPath);
        const norm = fullPath.replace(/\\/g, '/').toLowerCase();
        if (seenPaths.has(norm)) {
          continue;
        }

        if (!fs.existsSync(fullPath)) {
          continue;
        }

        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) {
          continue;
        }

        const classification = classifyFile(fullPath);
        if (classification.buildArtifact || classification.dependency) {
          continue;
        }

        seenPaths.add(norm);
        tasks.push(
          createWarmupTask({
            uri: vscode.Uri.file(fullPath),
            priority: 2, // P2
            source: 'gitChanged',
            reason: 'Git modified/untracked file',
          })
        );
      }
    } catch (err) {
      logger.debug(`Safe git status skipped for ${folderPath}`, { error: String(err) });
    }

    return tasks;
  }
}
