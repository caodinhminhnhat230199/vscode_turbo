import { describe, it, expect, beforeEach } from 'vitest';
import { workspace } from '../../mocks/vscode';
import { applyRecommendationService } from '../../../src/optimizer/ApplyRecommendation';
import { createRecommendation } from '../../../src/diagnostics/model/Recommendation';
import { BenchmarkResult } from '../../../src/benchmark/benchmarkTypes';

describe('ApplyRecommendationService', () => {
  beforeEach(() => {
    workspace._clearConfigs();
    applyRecommendationService.clearHistory();
  });

  it('applies recommendation changes to workspace configuration and records in session history', async () => {
    const existing = { '**/.git/**': true };
    workspace._setConfig('files.watcherExclude', existing);

    const rec = createRecommendation({
      id: 'REC_WATCHER_BUILD',
      type: 'workspaceSetting',
      title: 'Exclude build directory',
      description: 'Add build/ to files.watcherExclude',
      safeToAutoApply: true,
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: existing,
          newValue: { ...existing, '**/build/**': true },
          description: 'Exclude build',
          target: 'workspace',
        },
      ],
    });

    const result = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
    });

    expect(result.success).toBe(true);
    expect(result.appliedRecord).toBeDefined();

    const updated = workspace.getConfiguration('files').get('watcherExclude') as Record<
      string,
      boolean
    >;
    expect(updated['**/.git/**']).toBe(true);
    expect(updated['**/build/**']).toBe(true);

    const history = applyRecommendationService.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].recommendationId).toBe('REC_WATCHER_BUILD');
  });

  it('strictly preserves unrelated settings when applying recommendation', async () => {
    // Set unrelated configuration keys
    workspace._setConfig('editor.tabSize', 4);
    workspace._setConfig('files.autoSave', 'afterDelay');
    workspace._setConfig('search.exclude', { '**/node_modules/**': true });

    const originalWatcher = { '**/.git/**': true };
    workspace._setConfig('files.watcherExclude', originalWatcher);

    const rec = createRecommendation({
      id: 'REC_PRESERVE',
      type: 'workspaceSetting',
      title: 'Exclude cache',
      description: 'Add cache/ to watcher',
      safeToAutoApply: true,
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: originalWatcher,
          newValue: { ...originalWatcher, '**/.cache/**': true },
          description: 'Exclude cache',
          target: 'workspace',
        },
      ],
    });

    const res = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
    });
    expect(res.success).toBe(true);

    // Unrelated configs must remain intact
    expect(workspace.getConfiguration('editor').get('tabSize')).toBe(4);
    expect(workspace.getConfiguration('files').get('autoSave')).toBe('afterDelay');
    const searchExclude = workspace.getConfiguration('search').get('exclude') as Record<
      string,
      boolean
    >;
    expect(searchExclude['**/node_modules/**']).toBe(true);
  });

  it('runs before and after benchmark and captures comparison deltas', async () => {
    const preBench: BenchmarkResult = {
      operation: 'fileSearch',
      sampleCount: 3,
      minMs: 300,
      maxMs: 600,
      p50Ms: 450,
      p75Ms: 500,
      p90Ms: 550,
      p95Ms: 580,
      timestamp: Date.now(),
    };

    const postBench: BenchmarkResult = {
      operation: 'fileSearch',
      sampleCount: 3,
      minMs: 150,
      maxMs: 350,
      p50Ms: 220,
      p75Ms: 260,
      p90Ms: 300,
      p95Ms: 320,
      timestamp: Date.now(),
    };

    const rec = createRecommendation({
      id: 'REC_BENCH',
      type: 'workspaceSetting',
      title: 'Exclude generated files',
      description: 'Exclude',
      safeToAutoApply: true,
      changes: [
        {
          section: 'search.exclude',
          oldValue: {},
          newValue: { '**/build/**': true },
          description: 'Exclude build from search',
        },
      ],
    });

    const result = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
      preBenchmark: preBench,
      runBenchmarkFn: async () => postBench,
      benchmarkOperation: 'fileSearch',
    });

    expect(result.success).toBe(true);
    expect(result.comparison).toBeDefined();
    expect(result.comparison?.isOverallImprovement).toBe(true);
    expect(result.comparison?.p50Delta.delta).toBe(-230);
    expect(result.appliedRecord?.comparison).toBeDefined();
    expect(result.message).toContain('Measurable improvement');
  });

  it('undo reverts applied recommendation to previous settings', async () => {
    const original = { '**/.git/**': true };
    workspace._setConfig('files.watcherExclude', original);

    const rec = createRecommendation({
      id: 'REC_TEST',
      type: 'workspaceSetting',
      title: 'Test Recommendation',
      description: 'Test',
      safeToAutoApply: true,
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: original,
          newValue: { ...original, '**/dist/**': true },
          description: 'Exclude dist',
          target: 'workspace',
        },
      ],
    });

    const applyRes = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
    });
    expect(applyRes.success).toBe(true);

    // Verify it changed
    let current = workspace.getConfiguration('files').get('watcherExclude') as Record<
      string,
      boolean
    >;
    expect(current['**/dist/**']).toBe(true);

    // Now undo
    const undoRes = await applyRecommendationService.undo(applyRes.appliedRecord?.id, {
      skipPrompt: true,
    });
    expect(undoRes.success).toBe(true);

    // Verify reverted
    current = workspace.getConfiguration('files').get('watcherExclude') as Record<string, boolean>;
    expect(current['**/dist/**']).toBeUndefined();
    expect(current['**/.git/**']).toBe(true);
  });
});
