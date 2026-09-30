export interface IgnoreResolverOptions {
  customExcludes?: string[];
  filesExclude?: Record<string, boolean>;
  searchExclude?: Record<string, boolean>;
}

export class IgnoreResolver {
  private static readonly DEFAULT_IGNORES = [
    '.git',
    'node_modules',
    'build',
    'dist',
    'coverage',
    '.next',
    '.gradle',
    '.idea',
    '.dart_tool',
    'Pods',
    'DerivedData',
    '.vscode_test',
    'tmp',
    'temp',
  ];

  private ignoredFolders: Set<string> = new Set();
  private ignoredPatterns: string[] = [];

  constructor(options?: IgnoreResolverOptions) {
    this.rebuild(options);
  }

  public rebuild(options?: IgnoreResolverOptions): void {
    this.ignoredFolders = new Set(IgnoreResolver.DEFAULT_IGNORES.map((s) => s.toLowerCase()));
    this.ignoredPatterns = [];

    if (options?.customExcludes) {
      for (const exc of options.customExcludes) {
        this.addRule(exc);
      }
    }

    if (options?.filesExclude) {
      for (const [pattern, enabled] of Object.entries(options.filesExclude)) {
        if (enabled) {
          this.addRule(pattern);
        }
      }
    }

    if (options?.searchExclude) {
      for (const [pattern, enabled] of Object.entries(options.searchExclude)) {
        if (enabled) {
          this.addRule(pattern);
        }
      }
    }
  }

  private addRule(rule: string): void {
    const clean = rule
      .trim()
      .replace(/^[*\\/]+|[*\\/]+$/g, '')
      .toLowerCase();
    if (clean) {
      this.ignoredFolders.add(clean);
      this.ignoredPatterns.push(clean);
    }
  }

  public isIgnored(fsPath: string): boolean {
    const normalized = fsPath.replace(/\\/g, '/').toLowerCase();
    const segments = normalized.split('/');

    for (const segment of segments) {
      if (this.ignoredFolders.has(segment)) {
        return true;
      }
    }

    for (const pattern of this.ignoredPatterns) {
      if (normalized.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  public filterPaths(paths: string[]): string[] {
    return paths.filter((p) => !this.isIgnored(p));
  }
}

export const ignoreResolver = new IgnoreResolver();
