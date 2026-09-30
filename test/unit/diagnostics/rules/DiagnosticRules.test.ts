import { describe, it, expect, beforeEach } from 'vitest';
import { watcherRule001 } from '../../../../src/diagnostics/rules/watcherRules';
import { searchRule001 } from '../../../../src/diagnostics/rules/searchRules';
import {
  workspaceRule001,
  workspaceRule002,
} from '../../../../src/diagnostics/rules/workspaceRules';
import { fileRule001, fileRule002 } from '../../../../src/diagnostics/rules/fileRules';
import { DiagnosticEngine } from '../../../../src/diagnostics/DiagnosticEngine';
import { stateStore } from '../../../../src/core/state/StateStore';
import { ScanResult } from '../../../../src/core/workspace/WorkspaceScanner';
import { EffectiveExcludeSettings } from '../../../../src/core/workspace/excludes/ExcludeSettingsReader';

describe('Diagnostic Rules', () => {
  beforeEach(() => {
    stateStore.reset();
  });

  const createBaseContext = () => {
    const scanResult: ScanResult = {
      rootPath: '/projects/my-app',
      totalFiles: 100,
      totalDirectories: 10,
      totalSizeBytes: 500000,
      maxDepth: 4,
      extensionDistribution: { '.ts': 80, '.json': 20 },
      largestFiles: [],
      detectedBuildFolders: ['build', 'dist'],
      durationMs: 50,
      truncated: false,
    };

    const excludes: EffectiveExcludeSettings = {
      filesExclude: {
        defaultValue: {},
        effective: { '**/.git': true },
        activePatterns: ['**/.git'],
      },
      watcherExclude: {
        defaultValue: {},
        effective: { '**/.git/objects/**': true },
        activePatterns: ['**/.git/objects/**'],
      },
      searchExclude: {
        defaultValue: {},
        effective: { '**/node_modules': true },
        activePatterns: ['**/node_modules'],
      },
    };

    return { scanResult, excludes };
  };

  it('WATCHER_001 flags build folders not watcher-excluded with fix recommendation', () => {
    const context = createBaseContext();
    const findings = watcherRule001.evaluate(context);

    expect(findings).toHaveLength(2); // 'build' and 'dist'
    const buildFinding = findings.find((f) => f.id === 'WATCHER_001:build');

    expect(buildFinding).toBeDefined();
    expect(buildFinding?.severity).toBe('high');
    expect(buildFinding?.confidence).toBe('high');
    expect(buildFinding?.evidence.length).toBeGreaterThanOrEqual(1);
    expect(buildFinding?.recommendation?.changes?.[0].section).toBe('files.watcherExclude');
    expect(buildFinding?.recommendation?.changes?.[0].newValue).toHaveProperty('**/build/**');
  });

  it('SEARCH_001 flags generated folders not search-excluded', () => {
    const context = createBaseContext();
    const findings = searchRule001.evaluate(context);

    expect(findings).toHaveLength(2);
    const searchFinding = findings.find((f) => f.id === 'SEARCH_001:dist');

    expect(searchFinding).toBeDefined();
    expect(searchFinding?.severity).toBe('medium');
    expect(searchFinding?.confidence).toBe('high');
    expect(searchFinding?.recommendation?.changes?.[0].section).toBe('search.exclude');
  });

  it('WORKSPACE_001 triggers on very high file count (> 30000)', () => {
    const context = createBaseContext();
    context.scanResult.totalFiles = 45000;

    const findings = workspaceRule001.evaluate(context);

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('WORKSPACE_001');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].summary).toContain('45,000 files');
  });

  it('WORKSPACE_002 triggers on excessive generated files ratio (> 35%)', () => {
    const context = createBaseContext();
    context.scanResult.totalFiles = 200;
    const findings = workspaceRule002.evaluate({
      ...context,
      generatedSourceCount: 100, // 50%
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('WORKSPACE_002');
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].summary).toContain('50%');
    expect(findings[0].recommendation?.changes?.[0].section).toBe('vsturbo.index.generatedFiles');
  });

  it('FILE_001 triggers on very large source file (> 1MB)', () => {
    const context = createBaseContext();
    context.scanResult.largestFiles = [
      { path: '/projects/my-app/src/big_bundle.ts', sizeBytes: 2 * 1024 * 1024 },
    ];

    const findings = fileRule001.evaluate(context);

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toContain('FILE_001');
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].title).toContain('big_bundle.ts');
  });

  it('FILE_002 triggers when generated source file count is excessive (> 200)', () => {
    const context = createBaseContext();
    const findings = fileRule002.evaluate({
      ...context,
      generatedSourceCount: 350,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('FILE_002');
    expect(findings[0].severity).toBe('low');
    expect(findings[0].summary).toContain('350 generated code files');
  });

  it('DiagnosticEngine runs all rules and updates StateStore', () => {
    const engine = new DiagnosticEngine();
    const context = createBaseContext();
    context.scanResult.totalFiles = 35000;

    const findings = engine.analyze(context);

    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(stateStore.getState().findings).toEqual(findings);
  });
});
