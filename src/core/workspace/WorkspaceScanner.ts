import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'build',
  'dist',
  'out',
  '.dart_tool',
  '.next',
  '.nuxt',
  'target',
  'bin',
  'obj',
  '.gradle',
  'Pods',
  'DerivedData',
  'coverage',
  '.cache',
]);

export interface ScanOptions {
  maxFiles?: number;
  maxDepth?: number;
  maxDurationMs?: number;
  largestFilesLimit?: number;
  customExcludes?: string[];
  token?: { isCancellationRequested: boolean };
  yieldInterval?: number;
  onFile?: (file: FileSizeEntry) => void | Promise<void>;
}

export interface FileSizeEntry {
  path: string;
  sizeBytes: number;
}

export interface ScanResult {
  rootPath: string;
  totalFiles: number;
  totalDirectories: number;
  totalSizeBytes: number;
  maxDepth: number;
  extensionDistribution: Record<string, number>;
  largestFiles: FileSizeEntry[];
  detectedBuildFolders: string[];
  durationMs: number;
  truncated: boolean;
  truncateReason?: 'maxFiles' | 'timeout' | 'cancelled';
}

export class WorkspaceScanner {
  public async scan(rootPath: string, options: ScanOptions = {}): Promise<ScanResult> {
    const startTime = Date.now();
    const maxFiles = options.maxFiles ?? 50000;
    const maxDepth = options.maxDepth ?? 30;
    const maxDurationMs = options.maxDurationMs ?? 10000;
    const largestFilesLimit = options.largestFilesLimit ?? 10;
    const yieldInterval = options.yieldInterval ?? 100;
    const token = options.token;

    const excludedDirs = new Set(DEFAULT_EXCLUDED_DIRS);
    if (options.customExcludes) {
      for (const exc of options.customExcludes) {
        excludedDirs.add(exc);
      }
    }

    const result: ScanResult = {
      rootPath,
      totalFiles: 0,
      totalDirectories: 0,
      totalSizeBytes: 0,
      maxDepth: 0,
      extensionDistribution: {},
      largestFiles: [],
      detectedBuildFolders: [],
      durationMs: 0,
      truncated: false,
    };

    const visitedRealPaths = new Set<string>();
    try {
      const realRoot = await fs.promises.realpath(rootPath);
      visitedRealPaths.add(realRoot);
    } catch {
      visitedRealPaths.add(path.resolve(rootPath));
    }

    const queue: Array<{ dirPath: string; depth: number }> = [{ dirPath: rootPath, depth: 0 }];
    let itemsProcessed = 0;

    const buildFolderSet = new Set<string>();

    while (queue.length > 0) {
      if (token?.isCancellationRequested) {
        result.truncated = true;
        result.truncateReason = 'cancelled';
        break;
      }

      if (Date.now() - startTime >= maxDurationMs) {
        result.truncated = true;
        result.truncateReason = 'timeout';
        break;
      }

      if (result.totalFiles >= maxFiles) {
        result.truncated = true;
        result.truncateReason = 'maxFiles';
        break;
      }

      const current = queue.shift();
      if (!current) {
        break;
      }

      const { dirPath, depth } = current;
      if (depth > result.maxDepth) {
        result.maxDepth = depth;
      }

      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      } catch {
        // Directory may not be accessible or deleted during scan
        continue;
      }

      for (const entry of entries) {
        itemsProcessed++;
        if (itemsProcessed % yieldInterval === 0) {
          if (token?.isCancellationRequested) {
            result.truncated = true;
            result.truncateReason = 'cancelled';
            break;
          }
          if (Date.now() - startTime >= maxDurationMs) {
            result.truncated = true;
            result.truncateReason = 'timeout';
            break;
          }
          // Yield to event loop to keep Extension Host responsive
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() || entry.isSymbolicLink()) {
          result.totalDirectories++;

          // Check if excluded directory
          if (excludedDirs.has(entry.name)) {
            buildFolderSet.add(entry.name);
            continue;
          }

          if (depth >= maxDepth) {
            continue;
          }

          if (entry.isSymbolicLink()) {
            try {
              const realLink = await fs.promises.realpath(fullPath);
              if (visitedRealPaths.has(realLink)) {
                // Symlink loop detected, skip
                continue;
              }
              visitedRealPaths.add(realLink);
              const linkStat = await fs.promises.stat(fullPath);
              if (linkStat.isDirectory()) {
                queue.push({ dirPath: fullPath, depth: depth + 1 });
              }
            } catch {
              // Broken symlink
            }
          } else {
            try {
              const real = await fs.promises.realpath(fullPath);
              if (visitedRealPaths.has(real)) {
                continue;
              }
              visitedRealPaths.add(real);
              queue.push({ dirPath: fullPath, depth: depth + 1 });
            } catch {
              queue.push({ dirPath: fullPath, depth: depth + 1 });
            }
          }
        } else if (entry.isFile()) {
          result.totalFiles++;

          const ext = path.extname(entry.name).toLowerCase() || '[no_extension]';
          result.extensionDistribution[ext] = (result.extensionDistribution[ext] || 0) + 1;

          try {
            const stat = await fs.promises.stat(fullPath);
            const size = stat.size;
            result.totalSizeBytes += size;

            this.trackLargestFile(result.largestFiles, fullPath, size, largestFilesLimit);
            await options.onFile?.({ path: fullPath, sizeBytes: size });
          } catch {
            // Stat failure (e.g. permission or unlinked)
          }

          if (result.totalFiles >= maxFiles) {
            result.truncated = true;
            result.truncateReason = 'maxFiles';
            break;
          }
        }
      }
    }

    result.detectedBuildFolders = Array.from(buildFolderSet);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  private trackLargestFile(
    largestList: FileSizeEntry[],
    filePath: string,
    sizeBytes: number,
    limit: number
  ): void {
    if (largestList.length < limit) {
      largestList.push({ path: filePath, sizeBytes });
      largestList.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } else if (sizeBytes > largestList[largestList.length - 1].sizeBytes) {
      largestList[largestList.length - 1] = { path: filePath, sizeBytes };
      largestList.sort((a, b) => b.sizeBytes - a.sizeBytes);
    }
  }
}

export const workspaceScanner = new WorkspaceScanner();
