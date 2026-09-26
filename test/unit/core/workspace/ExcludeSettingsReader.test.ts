import { describe, it, expect, beforeEach } from 'vitest';
import { workspace, Uri } from '../../../mocks/vscode';
import { excludeSettingsReader } from '../../../../src/core/workspace/excludes/ExcludeSettingsReader';

describe('ExcludeSettingsReader', () => {
  beforeEach(() => {
    workspace._clearConfigs();
  });

  it('reads effective files.exclude, files.watcherExclude, and search.exclude without mutation', () => {
    workspace._setConfig('files.exclude', {
      '**/.git': true,
      '**/.svn': true,
      '**/CVS': false, // disabled exclude
    });

    workspace._setConfig('files.watcherExclude', {
      '**/.git/objects/**': true,
      '**/node_modules/**': true,
    });

    workspace._setConfig('search.exclude', {
      '**/node_modules': true,
      '**/bower_components': true,
    });

    workspace._setInspect('files', 'exclude', {
      defaultValue: { '**/.git': true },
      workspaceValue: { '**/.svn': true, '**/CVS': false },
    });

    const result = excludeSettingsReader.readEffectiveExcludes();

    // 1. files.exclude
    expect(result.filesExclude.effective['**/.git']).toBe(true);
    expect(result.filesExclude.effective['**/.svn']).toBe(true);
    expect(result.filesExclude.effective['**/CVS']).toBe(false);
    expect(result.filesExclude.activePatterns).toContain('**/.git');
    expect(result.filesExclude.activePatterns).toContain('**/.svn');
    expect(result.filesExclude.activePatterns).not.toContain('**/CVS');
    expect(result.filesExclude.workspaceValue?.['**/CVS']).toBe(false);

    // 2. files.watcherExclude
    expect(result.watcherExclude.activePatterns).toContain('**/.git/objects/**');
    expect(result.watcherExclude.activePatterns).toContain('**/node_modules/**');

    // 3. search.exclude
    expect(result.searchExclude.activePatterns).toContain('**/node_modules');
  });

  it('correctly checks if a folder is excluded by glob patterns', () => {
    const scoped = {
      effective: {
        '**/.git/**': true,
        '**/build/**': true,
        '**/.dart_tool/**': true,
        '**/node_modules': true,
      },
      activePatterns: ['**/.git/**', '**/build/**', '**/.dart_tool/**', '**/node_modules'],
    };

    expect(excludeSettingsReader.isFolderExcluded('.git', scoped)).toBe(true);
    expect(excludeSettingsReader.isFolderExcluded('build', scoped)).toBe(true);
    expect(excludeSettingsReader.isFolderExcluded('.dart_tool', scoped)).toBe(true);
    expect(excludeSettingsReader.isFolderExcluded('node_modules', scoped)).toBe(true);
    expect(excludeSettingsReader.isFolderExcluded('src', scoped)).toBe(false);
    expect(excludeSettingsReader.isFolderExcluded('lib', scoped)).toBe(false);
  });

  it('accepts resourceUri for scoped workspace folder configuration', () => {
    const resourceUri = Uri.file('/workspaces/sub-project');
    const result = excludeSettingsReader.readEffectiveExcludes(resourceUri);

    expect(result.resourceUri).toContain('sub-project');
    expect(result.filesExclude).toBeDefined();
    expect(result.watcherExclude).toBeDefined();
    expect(result.searchExclude).toBeDefined();
  });
});
