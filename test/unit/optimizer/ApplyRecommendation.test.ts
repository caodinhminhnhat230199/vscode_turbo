import { describe, it, expect, beforeEach, vi } from 'vitest';
import { commands, ConfigurationTarget, workspace, window } from '../../mocks/vscode';
import { applyRecommendationService } from '../../../src/optimizer/ApplyRecommendation';
import { createRecommendation } from '../../../src/diagnostics/model/Recommendation';
import { BenchmarkResult } from '../../../src/benchmark/benchmarkTypes';
import { stateStore } from '../../../src/core/state/StateStore';

describe('ApplyRecommendationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    workspace._clearConfigs();
    workspace._setWorkspaceFolders(undefined);
    applyRecommendationService.clearHistory();
    stateStore.updateFindings([]);
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

  it('undo restores the value present at apply time instead of a stale analysis snapshot', async () => {
    const analyzedValue = { '**/.git/**': true };
    const valueAtApplyTime = { ...analyzedValue, '**/user-added/**': true };
    workspace._setConfig('files.watcherExclude', valueAtApplyTime);

    const rec = createRecommendation({
      id: 'REC_STALE_SNAPSHOT',
      type: 'workspaceSetting',
      title: 'Preserve runtime settings',
      description: 'Add dist without losing newer settings',
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: analyzedValue,
          newValue: { ...analyzedValue, '**/dist/**': true },
          description: 'Exclude dist',
        },
      ],
    });

    const applyRes = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
      skipRefresh: true,
    });
    await applyRecommendationService.undo(applyRes.appliedRecord?.id, { skipPrompt: true });

    expect(workspace.getConfiguration('files').get('watcherExclude')).toEqual(valueAtApplyTime);
  });

  it('deep-merges dictionary patches while preserving unrelated nested keys and removals', async () => {
    workspace._setConfig('example.dictionary', {
      group: { keep: true, remove: true },
      unrelated: { enabled: true },
    });

    const rec = createRecommendation({
      id: 'REC_DEEP_MERGE',
      type: 'workspaceSetting',
      title: 'Patch nested dictionary',
      description: 'Preserve concurrent nested settings',
      changes: [
        {
          section: 'example.dictionary',
          oldValue: { group: { remove: true } },
          newValue: { group: { add: true } },
          description: 'Replace one nested key',
        },
      ],
    });

    await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
      skipRefresh: true,
    });

    expect(workspace.getConfiguration('example').get('dictionary')).toEqual({
      group: { keep: true, add: true },
      unrelated: { enabled: true },
    });
  });

  it('undoes bulk recommendations on the same setting without removing earlier applied changes', async () => {
    const original = { '**/.git/**': true };
    workspace._setConfig('files.watcherExclude', original);
    const createExcludeRecommendation = (id: string, pattern: string) =>
      createRecommendation({
        id,
        type: 'workspaceSetting',
        title: id,
        description: `Exclude ${pattern}`,
        changes: [
          {
            section: 'files.watcherExclude',
            oldValue: original,
            newValue: { ...original, [pattern]: true },
            description: `Exclude ${pattern}`,
          },
        ],
      });

    await applyRecommendationService.applyAll(
      [
        createExcludeRecommendation('REC_DIST', '**/dist/**'),
        createExcludeRecommendation('REC_BUILD', '**/build/**'),
      ],
      { skipPrompt: true, skipRefresh: true }
    );

    const [latestRecord] = applyRecommendationService.getHistory();
    await applyRecommendationService.undo(latestRecord.id, { skipPrompt: true });

    expect(workspace.getConfiguration('files').get('watcherExclude')).toEqual({
      '**/.git/**': true,
      '**/dist/**': true,
    });
  });

  it('uses the same Global target for apply and undo when no workspace is open', async () => {
    workspace._setConfig('files.watcherExclude', { '**/.git/**': true });
    const rec = createRecommendation({
      id: 'REC_NO_WORKSPACE',
      type: 'workspaceSetting',
      title: 'No workspace',
      description: 'Use a reversible fallback target',
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: { '**/.git/**': true },
          newValue: { '**/.git/**': true, '**/dist/**': true },
          description: 'Exclude dist',
          target: 'workspace',
        },
      ],
    });

    const applied = await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
      skipRefresh: true,
    });
    await applyRecommendationService.undo(applied.appliedRecord?.id, { skipPrompt: true });

    expect(workspace._getConfigUpdates().map((update) => update.target)).toEqual([
      ConfigurationTarget.Global,
      ConfigurationTarget.Global,
    ]);
  });

  it('warns that bulk apply changes global user settings when no workspace is open', async () => {
    const promptSpy = vi
      .spyOn(window, 'showInformationMessage')
      .mockResolvedValue('Approve All' as any);
    const rec = createRecommendation({
      id: 'REC_GLOBAL_NOTICE',
      type: 'workspaceSetting',
      title: 'Global fallback',
      description: 'Disclose the effective scope',
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: {},
          newValue: { '**/dist/**': true },
          description: 'Exclude dist',
        },
      ],
    });

    await applyRecommendationService.applyAll([rec], { skipRefresh: true });

    const [prompt] = promptSpy.mock.calls[0] as unknown as [string];
    expect(prompt).toContain('global user settings');
  });

  it('removes an applied recommendation from dashboard findings immediately', async () => {
    const rec = createRecommendation({
      id: 'REC_STATE_UPDATE',
      type: 'workspaceSetting',
      title: 'State update',
      description: 'Remove the applied finding',
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: {},
          newValue: { '**/dist/**': true },
          description: 'Exclude dist',
        },
      ],
    });
    stateStore.updateFindings([
      {
        id: 'FINDING_STATE_UPDATE',
        category: 'filesystem',
        severity: 'medium',
        title: 'Finding',
        summary: 'Summary',
        confidence: 'high',
        evidence: [],
        recommendation: rec,
        createdAt: Date.now(),
      },
    ]);

    await applyRecommendationService.applyRecommendation(rec, {
      skipPrompt: true,
      skipRefresh: true,
    });

    expect(stateStore.getState().findings).toEqual([]);
  });

  it('applyAll applies multiple recommendations and returns aggregate result', async () => {
    const original = { '**/.git/**': true };
    workspace._setConfig('files.watcherExclude', original);
    workspace._setConfig('search.exclude', {});

    const rec1 = createRecommendation({
      id: 'REC_BULK_1',
      type: 'workspaceSetting',
      title: 'Bulk Rec 1',
      description: 'Exclude dist',
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

    const rec2 = createRecommendation({
      id: 'REC_BULK_2',
      type: 'workspaceSetting',
      title: 'Bulk Rec 2',
      description: 'Exclude build from search',
      safeToAutoApply: true,
      changes: [
        {
          section: 'search.exclude',
          oldValue: {},
          newValue: { '**/build/**': true },
          description: 'Exclude build',
          target: 'workspace',
        },
      ],
    });

    const res = await applyRecommendationService.applyAll([rec1, rec2], {
      skipPrompt: true,
    });

    expect(res.success).toBe(true);
    expect(res.appliedCount).toBe(2);

    const watcher = workspace.getConfiguration('files').get('watcherExclude') as Record<
      string,
      boolean
    >;
    expect(watcher['**/dist/**']).toBe(true);

    const search = workspace.getConfiguration('search').get('exclude') as Record<string, boolean>;
    expect(search['**/build/**']).toBe(true);
  });

  it('applyAll returns failure message when given no valid recommendations', async () => {
    const res = await applyRecommendationService.applyAll([], { skipPrompt: true });
    expect(res.success).toBe(false);
    expect(res.appliedCount).toBe(0);
  });

  it.each(['Approve All', 'Apply All', 'OK', 'Yes'])(
    'applyAll succeeds when user confirms with "%s"',
    async (selection) => {
      const spy = vi.spyOn(window, 'showInformationMessage').mockResolvedValue(selection as any);

      const rec = createRecommendation({
        id: `REC_CONFIRM_${selection}`,
        type: 'workspaceSetting',
        title: 'Rec',
        description: 'Desc',
        safeToAutoApply: true,
        changes: [
          {
            section: 'files.watcherExclude',
            oldValue: {},
            newValue: { '**/test_confirm/**': true },
            description: 'Exclude',
            target: 'workspace',
          },
        ],
      });

      const res = await applyRecommendationService.applyAll([rec], {
        skipPrompt: false,
        skipRefresh: true,
      });
      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(1);
      expect(spy).toHaveBeenCalled();
    }
  );

  it('refreshes diagnostics once after bulk apply', async () => {
    const executeSpy = vi.spyOn(commands, 'executeCommand');
    const rec = createRecommendation({
      id: 'REC_REFRESH_ONCE',
      type: 'workspaceSetting',
      title: 'Refresh once',
      description: 'Refresh after the batch',
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: {},
          newValue: { '**/dist/**': true },
          description: 'Exclude dist',
        },
      ],
    });

    await applyRecommendationService.applyAll([rec, { ...rec, id: 'REC_REFRESH_TWICE' }], {
      skipPrompt: true,
    });

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith('vsturbo.analyzeWorkspace');
  });
});
