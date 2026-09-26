import { describe, it, expect } from 'vitest';
import { SettingsDiff } from '../../../src/optimizer/SettingsDiff';

describe('SettingsDiff', () => {
  it('merges new excludes while preserving all unrelated existing keys', () => {
    const existing = {
      '**/.git/**': true,
      '**/.svn/**': true,
      '**/custom_user_ignore/**': true,
    };

    const additions = {
      '**/build/**': true,
      '**/.dart_tool/**': true,
    };

    const merged = SettingsDiff.mergeExcludes(existing, additions);

    expect(merged['**/.git/**']).toBe(true);
    expect(merged['**/.svn/**']).toBe(true);
    expect(merged['**/custom_user_ignore/**']).toBe(true);
    expect(merged['**/build/**']).toBe(true);
    expect(merged['**/.dart_tool/**']).toBe(true);
  });

  it('computes structured diff and human-readable representation for object settings', () => {
    const before = {
      '**/.git/**': true,
      '**/old/**': true,
    };
    const after = {
      '**/.git/**': true,
      '**/new/**': true,
    };

    const diff = SettingsDiff.computeDiff('files.watcherExclude', before, after);

    expect(diff.hasChanges).toBe(true);
    expect(diff.patch.addedKeys).toContain('**/new/**');
    expect(diff.patch.removedKeys).toContain('**/old/**');
    expect(diff.humanReadable).toContain('+ "**/new/**": true');
    expect(diff.humanReadable).toContain('- "**/old/**": true');
    expect(diff.isValid).toBe(true);
  });

  it('computes diff for scalar primitive values', () => {
    const diff = SettingsDiff.computeDiff('codePulse.index.generatedFiles', true, false);

    expect(diff.hasChanges).toBe(true);
    expect(diff.patch.modifiedKeys).toContain('codePulse.index.generatedFiles');
    expect(diff.humanReadable).toContain('- true');
    expect(diff.humanReadable).toContain('+ false');
  });

  it('validates patch correctly', () => {
    const valid = SettingsDiff.validatePatch({
      section: 'files.exclude',
      before: {},
      after: { '**/build/**': true },
      addedKeys: ['**/build/**'],
      removedKeys: [],
      modifiedKeys: [],
      target: 'workspace',
    });
    expect(valid.isValid).toBe(true);

    const invalid = SettingsDiff.validatePatch({
      section: '',
      before: {},
      after: {},
      addedKeys: [],
      removedKeys: [],
      modifiedKeys: [],
      target: 'workspace',
    });
    expect(invalid.isValid).toBe(false);
  });
});
