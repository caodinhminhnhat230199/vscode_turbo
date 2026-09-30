import * as fs from 'fs';
import * as path from 'path';
import {
  IWorkspaceScanner,
  WorkspaceScanOptions,
  WorkspaceScanResult,
} from '../core/interfaces/IWorkspaceScanner';
import { ignoreResolver } from './IgnoreResolver';

export class WorkspaceScanner implements IWorkspaceScanner {
  private isCancelled = false;

  public async scan(roots: string[], options?: WorkspaceScanOptions): Promise<WorkspaceScanResult> {
    const startTime = performance.now();
    this.isCancelled = false;
    const collectedFiles: string[] = [];
    const maxFiles = options?.maxFiles ?? 200000;

    for (const root of roots) {
      if (this.isCancelled || options?.token?.isCancellationRequested) {
        break;
      }
      await this.scanDirectory(root, collectedFiles, maxFiles, options);
    }

    return {
      files: collectedFiles,
      totalCount: collectedFiles.length,
      durationMs: performance.now() - startTime,
    };
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  private async scanDirectory(
    dir: string,
    result: string[],
    maxFiles: number,
    options?: WorkspaceScanOptions
  ): Promise<void> {
    if (this.isCancelled || options?.token?.isCancellationRequested || result.length >= maxFiles) {
      return;
    }

    if (ignoreResolver.isIgnored(dir)) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        this.isCancelled ||
        options?.token?.isCancellationRequested ||
        result.length >= maxFiles
      ) {
        return;
      }

      const fullPath = path.join(dir, entry.name).replace(/\\/g, '/');

      if (ignoreResolver.isIgnored(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, result, maxFiles, options);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
}

export const workspaceScanner = new WorkspaceScanner();
