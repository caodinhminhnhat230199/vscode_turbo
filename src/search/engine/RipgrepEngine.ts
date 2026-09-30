import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { TextSearchResult } from '../models/SearchResult';
import { TextSearchOptions } from '../models/SearchOptions';
import { SearchExcludes } from './SearchExcludes';
import { logger } from '../../core/logging/Logger';
import { isWorkspaceTrusted } from '../../vscode/workspaceTrust';
import { configService } from '../../vscode/config';

export interface VimgrepMatch {
  filePath: string;
  line: number;
  column: number;
  lineText: string;
}

export function parseVimgrepLine(line: string): VimgrepMatch | undefined {
  const match = line.match(/^(.*?):(\d+):(\d+):(.*)$/);
  if (!match) {
    return undefined;
  }

  return {
    filePath: match[1],
    line: Number.parseInt(match[2], 10),
    column: Number.parseInt(match[3], 10),
    lineText: match[4],
  };
}

export class RipgrepEngine {
  private static cachedRgPath: string | null | undefined = undefined;
  private static activeProcesses = new Set<ChildProcess>();

  public static killAllProcesses(): void {
    for (const proc of RipgrepEngine.activeProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    RipgrepEngine.activeProcesses.clear();
  }

  public static isValidBinary(candidate: string): boolean {
    try {
      if (!candidate || typeof candidate !== 'string') {
        return false;
      }
      if (!fs.existsSync(candidate)) {
        return false;
      }
      const stat = fs.statSync(candidate);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  public static getRipgrepPath(): string | null {
    if (RipgrepEngine.cachedRgPath !== undefined) {
      return RipgrepEngine.cachedRgPath;
    }

    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'rg.exe' : 'rg';

    // 1. Check VS Code appRoot
    try {
      const appRoot = vscode.env.appRoot;
      if (appRoot) {
        const candidates = [
          path.join(appRoot, 'node_modules/@vscode/ripgrep/bin', binaryName),
          path.join(appRoot, 'node_modules.asar.unpacked/@vscode/ripgrep/bin', binaryName),
          path.join(appRoot, 'node_modules/vscode-ripgrep/bin', binaryName),
        ];

        for (const candidate of candidates) {
          if (RipgrepEngine.isValidBinary(candidate)) {
            RipgrepEngine.cachedRgPath = candidate;
            return candidate;
          }
        }
      }
    } catch {
      // ignore
    }

    // 2. Check local node_modules
    try {
      const localRg = path.resolve(
        __dirname,
        '../../../../node_modules/@vscode/ripgrep/bin',
        binaryName
      );
      if (RipgrepEngine.isValidBinary(localRg)) {
        RipgrepEngine.cachedRgPath = localRg;
        return localRg;
      }
    } catch {
      // ignore
    }

    RipgrepEngine.cachedRgPath = null;
    return null;
  }

  public async search(query: string, options?: TextSearchOptions): Promise<TextSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const roots =
      options?.workspaceRoots ?? vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];

    if (!configService.getConfig().searchUseRipgrep) {
      return this.searchWithNodeFallback(trimmed, roots, options);
    }

    // Workspace trust check: do not spawn external processes in untrusted workspaces
    if (!isWorkspaceTrusted()) {
      logger.info(
        'Workspace is untrusted. Skipping Ripgrep binary execution; falling back to safe Node regex search.'
      );
      return this.searchWithNodeFallback(trimmed, roots, options);
    }

    const rgPath = RipgrepEngine.getRipgrepPath();
    if (rgPath && roots.length > 0) {
      try {
        return await this.searchWithRipgrep(rgPath, trimmed, roots, options);
      } catch (err) {
        logger.debug('Ripgrep search failed, falling back to pure Node regex search', {
          error: String(err),
        });
      }
    }

    // Fallback: Pure Node regex search
    return this.searchWithNodeFallback(trimmed, roots, options);
  }

  private async searchWithRipgrep(
    rgPath: string,
    query: string,
    roots: string[],
    options?: TextSearchOptions
  ): Promise<TextSearchResult[]> {
    const limit = options?.limit ?? 50;
    const timeoutMs = 5000;
    const token = options?.cancellationToken;

    const args: string[] = ['--vimgrep', '--no-heading', '--line-number', '--color', 'never'];

    if (!options?.caseSensitive) {
      args.push('--ignore-case');
    } else {
      args.push('--case-sensitive');
    }

    if (options?.wholeWord) {
      args.push('--word-regexp');
    }

    if (!options?.isRegex) {
      args.push('--fixed-strings');
    }

    // Exclude globs
    const excludes = SearchExcludes.getExcludeGlobs({ includeIgnored: options?.includeIgnored });
    for (const pattern of excludes) {
      args.push('--glob', `!${pattern}`);
    }

    // Max count
    args.push('--max-count', String(limit));
    args.push('--', query);

    // Add root directories
    args.push(...roots);

    return new Promise((resolve) => {
      const results: TextSearchResult[] = [];
      let isDone = false;

      // Safe spawn: NEVER pass shell: true, args are passed directly as array
      const proc = spawn(rgPath, args, {
        windowsHide: true,
        shell: false,
      });
      RipgrepEngine.activeProcesses.add(proc);

      const timer = setTimeout(() => {
        cleanup();
        proc.kill('SIGTERM');
        resolve(results);
      }, timeoutMs);

      const cancelRegistration = token?.onCancellationRequested(() => {
        cleanup();
        proc.kill('SIGTERM');
        resolve(results);
      });

      const cleanup = () => {
        if (isDone) {
          return;
        }
        isDone = true;
        RipgrepEngine.activeProcesses.delete(proc);
        clearTimeout(timer);
        cancelRegistration?.dispose();
      };

      const rl = readline.createInterface({
        input: proc.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        if (results.length >= limit) {
          cleanup();
          proc.kill('SIGTERM');
          resolve(results);
          return;
        }

        // Format: <path>:<line>:<col>:<lineText>
        const match = parseVimgrepLine(line);
        if (match) {
          const { filePath, line: oneBasedLine, column: oneBasedColumn, lineText } = match;

          if (
            options?.pathFilter &&
            !filePath.toLowerCase().includes(options.pathFilter.toLowerCase())
          ) {
            return;
          }

          if (
            options?.extFilter &&
            path.extname(filePath).replace(/^\./, '').toLowerCase() !==
              options.extFilter.toLowerCase()
          ) {
            return;
          }

          const lineNum = Math.max(0, oneBasedLine - 1);
          const colNum = Math.max(0, oneBasedColumn - 1);

          results.push({
            id: `text:${filePath}:${lineNum}:${colNum}`,
            category: 'text',
            score: 500,
            uri: vscode.Uri.file(filePath),
            label: lineText.trim(),
            description: path.basename(filePath),
            detail: `${vscode.workspace.asRelativePath(filePath)}:${lineNum + 1}`,
            line: lineNum,
            column: colNum,
            lineText,
            matchLength: query.length,
          });
        }
      });

      proc.on('close', () => {
        cleanup();
        resolve(results);
      });

      proc.on('error', () => {
        cleanup();
        resolve(results);
      });
    });
  }

  private async searchWithNodeFallback(
    query: string,
    roots: string[],
    options?: TextSearchOptions
  ): Promise<TextSearchResult[]> {
    const limit = options?.limit ?? 50;
    const token = options?.cancellationToken;
    const results: TextSearchResult[] = [];

    let pattern: RegExp;
    try {
      const flags = options?.caseSensitive ? 'g' : 'gi';
      const escaped = options?.isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const finalPattern = options?.wholeWord ? `\\b${escaped}\\b` : escaped;
      pattern = new RegExp(finalPattern, flags);
    } catch {
      return [];
    }

    const filesToScan: string[] = [];

    // Collect candidate files from roots
    for (const root of roots) {
      if (token?.isCancellationRequested) {
        break;
      }
      this.collectFilesRecursive(root, filesToScan, options);
    }

    for (const filePath of filesToScan) {
      if (token?.isCancellationRequested || results.length >= limit) {
        break;
      }

      try {
        const stat = fs.statSync(filePath);
        if (stat.size > (options?.maxFilesizeBytes ?? 1024 * 1024)) {
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= limit || token?.isCancellationRequested) {
            break;
          }

          const line = lines[i];
          pattern.lastIndex = 0;
          const match = pattern.exec(line);
          if (match) {
            results.push({
              id: `text:${filePath}:${i}:${match.index}`,
              category: 'text',
              score: 500,
              uri: vscode.Uri.file(filePath),
              label: line.trim(),
              description: path.basename(filePath),
              detail: `${vscode.workspace.asRelativePath(filePath)}:${i + 1}`,
              line: i,
              column: match.index,
              lineText: line,
              matchLength: match[0].length,
            });
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  private collectFilesRecursive(
    dir: string,
    outFiles: string[],
    options?: TextSearchOptions
  ): void {
    if (SearchExcludes.isExcluded(dir, { includeIgnored: options?.includeIgnored })) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (SearchExcludes.isExcluded(fullPath, { includeIgnored: options?.includeIgnored })) {
          continue;
        }

        if (entry.isDirectory()) {
          this.collectFilesRecursive(fullPath, outFiles, options);
        } else if (entry.isFile()) {
          if (
            options?.pathFilter &&
            !fullPath.toLowerCase().includes(options.pathFilter.toLowerCase())
          ) {
            continue;
          }
          if (
            options?.extFilter &&
            path.extname(fullPath).replace(/^\./, '').toLowerCase() !==
              options.extFilter.toLowerCase()
          ) {
            continue;
          }
          outFiles.push(fullPath);
        }
      }
    } catch {
      // directory unreadable
    }
  }
}
