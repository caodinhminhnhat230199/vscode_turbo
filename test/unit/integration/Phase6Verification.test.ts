import { describe, it, expect, beforeEach } from 'vitest';
import { workspace } from '../../mocks/vscode';
import { OptimizationRuleRegistry } from '../../../src/optimizer/OptimizationRuleRegistry';
import { watcherRule001 } from '../../../src/diagnostics/rules/watcherRules';
import { searchRule001 } from '../../../src/diagnostics/rules/searchRules';
import { indexRule001 } from '../../../src/diagnostics/rules/indexRules';
import { extensionConflictRule } from '../../../src/diagnostics/rules/extensionConflictRules';
import { LanguageRulesEvaluator } from '../../../src/diagnostics/rules/languageRules';
import { applyRecommendationService } from '../../../src/optimizer/ApplyRecommendation';
import { BenchmarkDeltaService } from '../../../src/optimizer/BenchmarkDeltaService';
import { BenchmarkResult } from '../../../src/benchmark/benchmarkTypes';
import { createRecommendation } from '../../../src/diagnostics/model/Recommendation';
import { ScanResult } from '../../../src/core/workspace/WorkspaceScanner';
import { EffectiveExcludeSettings } from '../../../src/core/workspace/excludes/ExcludeSettingsReader';

describe('P6.12 — Phase 6 Optimization Engine Verification', () => {
  beforeEach(() => {
    workspace._clearConfigs();
    applyRecommendationService.clearHistory();
  });

  it('P6.1 & P6.2: Rule registry registers, isolates errors, and sorts findings by severity', async () => {
    const registry = new OptimizationRuleRegistry();

    registry.register({
      id: 'CRASH_RULE',
      evaluate: async () => {
        throw new Error('Exploded unexpectedly');
      },
    });

    registry.register(indexRule001);

    const findings = await registry.evaluateAll({
      reindexStats: {
        invalidationsPerMinute: 25,
        reindexCount: 10,
        generatedFilesWatched: ['build'],
      },
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('INDEX_001:WorkspaceIndex');
    expect(findings[0].severity).toBe('critical');
  });

  it('P6.3 & P6.4: WATCHER_001 and SEARCH_001 produce complete evidence (path, file count, estimated share)', () => {
    const dummyScan: ScanResult = {
      rootPath: '/dummy',
      totalFiles: 1000,
      totalDirectories: 50,
      totalSizeBytes: 500000,
      maxDepth: 5,
      extensionDistribution: { dart: 500 },
      largestFiles: [
        { path: '/dummy/build/out.bin', sizeBytes: 200000 },
        { path: '/dummy/build/app.dill', sizeBytes: 150000 },
      ],
      detectedBuildFolders: ['build'],
      durationMs: 50,
      truncated: false,
    };

    const dummyExcludes: EffectiveExcludeSettings = {
      filesExclude: { activePatterns: [], effective: {} },
      searchExclude: { activePatterns: [], effective: {} },
      watcherExclude: { activePatterns: [], effective: {} },
    };

    const watcherFindings = watcherRule001.evaluate({
      scanResult: dummyScan,
      excludes: dummyExcludes,
    });

    expect(watcherFindings).toHaveLength(1);
    const wFinding = watcherFindings[0];
    const wEvidenceLabels = wFinding.evidence.map((e) => e.label);
    expect(wEvidenceLabels).toContain('Directory Path');
    expect(wEvidenceLabels).toContain('Significant File Count');
    expect(wEvidenceLabels).toContain('Estimated Workspace Share');

    const searchFindings = searchRule001.evaluate({
      scanResult: dummyScan,
      excludes: dummyExcludes,
    });

    expect(searchFindings).toHaveLength(1);
    const sFinding = searchFindings[0];
    const sEvidenceLabels = sFinding.evidence.map((e) => e.label);
    expect(sEvidenceLabels).toContain('Directory Path');
    expect(sEvidenceLabels).toContain('Significant File Count');
    expect(sEvidenceLabels).toContain('Estimated Workspace Share');
  });

  it('P6.5 & P6.6: LANGUAGE_001 and LANGUAGE_002 handle cold vs warm slowdowns accurately', () => {
    // Cold start
    const coldResult: BenchmarkResult = {
      operation: 'definition',
      sampleCount: 5,
      minMs: 80,
      maxMs: 1400,
      p50Ms: 90,
      p75Ms: 110,
      p90Ms: 150,
      p95Ms: 200,
      samples: [
        { iteration: 0, durationMs: 1400, resultCount: 1, isWarmup: true, timestamp: 1 },
        { iteration: 1, durationMs: 90, resultCount: 1, isWarmup: false, timestamp: 2 },
      ],
      timestamp: Date.now(),
      category: 'LANGUAGE_COLD_START',
    };

    const coldFindings = LanguageRulesEvaluator.evaluateBenchmark(coldResult);
    expect(coldFindings).toHaveLength(1);
    expect(coldFindings[0].id).toBe('LANGUAGE_001:definition');
    expect(coldFindings[0].recommendation?.type).toBe('codePulseSetting');

    // Warm persistent slow
    const slowResult: BenchmarkResult = {
      operation: 'references',
      sampleCount: 5,
      minMs: 800,
      maxMs: 1500,
      p50Ms: 950,
      p75Ms: 1100,
      p90Ms: 1300,
      p95Ms: 1450,
      timestamp: Date.now(),
      category: 'LANGUAGE_PERSISTENT_SLOW',
    };

    const slowFindings = LanguageRulesEvaluator.evaluateBenchmark(slowResult);
    expect(slowFindings).toHaveLength(1);
    expect(slowFindings[0].id).toBe('LANGUAGE_002:references');
    expect(slowFindings[0].recommendation?.changes?.[0].section).toBe('codePulse.navigation.mode');
    expect(slowFindings[0].recommendation?.changes?.[0].newValue).toBe('hybrid');
  });

  it('P6.7 & P6.8: Extension conflict heuristics avoid misleading confidence and never auto-disable', async () => {
    const findings = await extensionConflictRule.evaluate({
      installedExtensions: [
        {
          id: 'publisher.dart-first',
          isActive: true,
          packageJSON: { contributes: { languages: [{ id: 'dart' }] } },
        },
        {
          id: 'publisher.dart-second',
          isActive: true,
          packageJSON: { contributes: { languages: [{ id: 'dart' }] } },
        },
      ],
    });

    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.id).toBe('EXTENSION_001:dart');
    // Must avoid misleading high confidence
    expect(f.confidence).toBe('medium');
    // Must not claim verified CPU attribution
    expect(f.summary).toContain('Multiple installed extensions');
    expect(f.evidence.find((e) => e.label === 'Assessment')?.value).toContain(
      'unmeasured CPU attribution'
    );
    // Must NOT auto disable
    expect(f.recommendation?.safeToAutoApply).toBe(false);
  });

  it('P6.9 & P6.10 & P6.12: Recommendation apply preserves unrelated settings, undo restores, delta tracks improvement & regression', async () => {
    // Set unrelated settings
    workspace._setConfig('git.autofetch', true);
    workspace._setConfig('editor.fontSize', 14);
    workspace._setConfig('files.watcherExclude', { '**/.git/**': true });

    const rec = createRecommendation({
      id: 'REC_OPTIMIZE_BUILD',
      type: 'workspaceSetting',
      title: 'Exclude build directory',
      description: 'Exclude build',
      safeToAutoApply: true,
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: { '**/.git/**': true },
          newValue: { '**/.git/**': true, '**/build/**': true },
          description: 'Exclude build',
          target: 'workspace',
        },
      ],
    });

    const preBench: BenchmarkResult = {
      operation: 'fileSearch',
      sampleCount: 3,
      minMs: 200,
      maxMs: 500,
      p50Ms: 300,
      p75Ms: 350,
      p90Ms: 400,
      p95Ms: 450,
      timestamp: Date.now(),
    };

    // Case A: Improvement
    const postBenchImproved: BenchmarkResult = {
      ...preBench,
      p50Ms: 180,
      p95Ms: 250,
    };

    const applyResult = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
      preBenchmark: preBench,
      runBenchmarkFn: async () => postBenchImproved,
      benchmarkOperation: 'fileSearch',
    });

    expect(applyResult.success).toBe(true);
    expect(applyResult.comparison?.isOverallImprovement).toBe(true);
    expect(applyResult.comparison?.p50Delta.delta).toBe(-120);

    // Verify unrelated settings are completely preserved
    expect(workspace.getConfiguration('git').get('autofetch')).toBe(true);
    expect(workspace.getConfiguration('editor').get('fontSize')).toBe(14);
    const updatedWatcher = workspace.getConfiguration('files').get('watcherExclude') as Record<
      string,
      boolean
    >;
    expect(updatedWatcher['**/build/**']).toBe(true);

    // Case B: Regression detection
    const postBenchRegressed: BenchmarkResult = {
      ...preBench,
      p50Ms: 420,
      p95Ms: 650,
    };
    const regressedComp = BenchmarkDeltaService.compare(preBench, postBenchRegressed);
    expect(regressedComp.isRegression).toBe(true);
    expect(regressedComp.isOverallImprovement).toBe(false);
    expect(regressedComp.p50Delta.delta).toBe(120);
    expect(regressedComp.honestyAssessment).toContain('Performance regressed');

    // Case C: Undo works and restores original settings
    const undoResult = await applyRecommendationService.undo(applyResult.appliedRecord?.id, {
      skipPrompt: true,
    });
    expect(undoResult.success).toBe(true);

    const revertedWatcher = workspace.getConfiguration('files').get('watcherExclude') as Record<
      string,
      boolean
    >;
    expect(revertedWatcher['**/build/**']).toBeUndefined();
    expect(revertedWatcher['**/.git/**']).toBe(true);
    // Unrelated configs still untouched
    expect(workspace.getConfiguration('git').get('autofetch')).toBe(true);
    expect(workspace.getConfiguration('editor').get('fontSize')).toBe(14);
  });
});
