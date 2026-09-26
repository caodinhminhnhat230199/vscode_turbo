import * as vscode from 'vscode';

export type ExcludePatterns = Record<string, boolean | { when?: string }>;

export interface ScopedExcludePatterns {
  defaultValue?: ExcludePatterns;
  globalValue?: ExcludePatterns;
  workspaceValue?: ExcludePatterns;
  workspaceFolderValue?: ExcludePatterns;
  effective: ExcludePatterns;
  activePatterns: string[];
}

export interface EffectiveExcludeSettings {
  resourceUri?: string;
  filesExclude: ScopedExcludePatterns;
  watcherExclude: ScopedExcludePatterns;
  searchExclude: ScopedExcludePatterns;
}

export class ExcludeSettingsReader {
  public readEffectiveExcludes(resourceUri?: vscode.Uri): EffectiveExcludeSettings {
    const filesConfig = vscode.workspace.getConfiguration('files', resourceUri);
    const searchConfig = vscode.workspace.getConfiguration('search', resourceUri);

    const filesExclude = this.resolveScoped(filesConfig, 'exclude');
    const watcherExclude = this.resolveScoped(filesConfig, 'watcherExclude');
    const searchExclude = this.resolveScoped(searchConfig, 'exclude');

    return {
      resourceUri: resourceUri?.toString(),
      filesExclude,
      watcherExclude,
      searchExclude,
    };
  }

  private resolveScoped(
    config: vscode.WorkspaceConfiguration,
    section: string
  ): ScopedExcludePatterns {
    const inspection = config.inspect<ExcludePatterns>(section);

    const defaultValue = inspection?.defaultValue ?? {};
    const globalValue = inspection?.globalValue;
    const workspaceValue = inspection?.workspaceValue;
    const workspaceFolderValue = inspection?.workspaceFolderValue;

    // Direct effective value resolved by VS Code config system
    const rawEffective = config.get<ExcludePatterns>(section, {});
    const effective: ExcludePatterns = { ...rawEffective };

    // Extract all patterns where exclude value is active (true or conditional object)
    const activePatterns: string[] = [];
    for (const [pattern, val] of Object.entries(effective)) {
      if (val === true || (typeof val === 'object' && val !== null)) {
        activePatterns.push(pattern);
      }
    }

    return {
      defaultValue,
      globalValue,
      workspaceValue,
      workspaceFolderValue,
      effective,
      activePatterns,
    };
  }

  public isPatternExcluded(pattern: string, scoped: ScopedExcludePatterns): boolean {
    const val = scoped.effective[pattern];
    return val === true || (typeof val === 'object' && val !== null);
  }

  public isFolderExcluded(folderName: string, scoped: ScopedExcludePatterns): boolean {
    const normalizedName = folderName.replace(/^[\\/]+|[\\/]+$/g, '').toLowerCase();

    for (const pattern of scoped.activePatterns) {
      const normalizedPat = pattern.replace(/^[\\/]+|[\\/]+$/g, '').toLowerCase();

      if (
        normalizedPat === normalizedName ||
        normalizedPat === `**/${normalizedName}` ||
        normalizedPat === `**/${normalizedName}/**` ||
        normalizedPat === `${normalizedName}/**` ||
        normalizedPat.endsWith(`/${normalizedName}/**`) ||
        normalizedPat.endsWith(`/${normalizedName}`) ||
        normalizedPat.includes(`/${normalizedName}/`)
      ) {
        return true;
      }
    }

    return false;
  }
}

export const excludeSettingsReader = new ExcludeSettingsReader();
