import * as vscode from 'vscode';
import * as path from 'path';

export const DEFAULT_SEARCH_EXCLUDES = [
  '**/.git/**',
  '**/node_modules/**',
  '**/build/**',
  '**/.dart_tool/**',
  '**/dist/**',
  '**/out/**',
  '**/.cache/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/coverage/**',
];

export class SearchExcludes {
  public static getExcludeGlobs(options?: { includeIgnored?: boolean }): string[] {
    if (options?.includeIgnored) {
      return ['**/.git/**'];
    }

    const globs = new Set<string>(DEFAULT_SEARCH_EXCLUDES);

    try {
      const searchConfig = vscode.workspace.getConfiguration('search');
      const searchExcludes = searchConfig.get<Record<string, boolean>>('exclude') ?? {};
      for (const [pattern, enabled] of Object.entries(searchExcludes)) {
        if (enabled) {
          globs.add(pattern);
        }
      }

      const filesConfig = vscode.workspace.getConfiguration('files');
      const filesExcludes = filesConfig.get<Record<string, boolean>>('exclude') ?? {};
      for (const [pattern, enabled] of Object.entries(filesExcludes)) {
        if (enabled) {
          globs.add(pattern);
        }
      }
    } catch {
      // Configuration fallback
    }

    return Array.from(globs);
  }

  public static isExcluded(filePath: string, options?: { includeIgnored?: boolean }): boolean {
    if (options?.includeIgnored) {
      return filePath.includes('/.git/') || filePath.includes('\\.git\\');
    }

    const norm = filePath.replace(/\\/g, '/').toLowerCase();
    const segments = norm.split('/');

    // Check directory names against common excluded dirs
    const forbiddenDirs = [
      '.git',
      'node_modules',
      'build',
      '.dart_tool',
      'dist',
      'out',
      '.cache',
      '.idea',
      'coverage',
    ];

    for (const dir of forbiddenDirs) {
      if (segments.includes(dir)) {
        return true;
      }
    }

    // Check extensions
    const basename = path.basename(norm);
    if (basename.endsWith('.g.dart') || basename.endsWith('.freezed.dart')) {
      return true;
    }

    return false;
  }
}
