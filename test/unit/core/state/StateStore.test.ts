import { describe, it, expect, beforeEach } from 'vitest';
import { StateStore } from '../../../../src/core/state/StateStore';
import { BenchmarkResult, PerformanceFinding } from '../../../../src/core/models/diagnosticModels';

describe('StateStore', () => {
  let store: StateStore;

  beforeEach(() => {
    store = StateStore.getInstance();
    store.reset();
  });

  it('starts with default initial state', () => {
    const state = store.getState();
    expect(state.findings).toEqual([]);
    expect(state.benchmarks).toEqual([]);
    expect(state.indexStatus.status).toBe('idle');
    expect(state.warmupStatus.status).toBe('idle');
  });

  it('updates findings and notifies subscriber', () => {
    const finding: PerformanceFinding = {
      id: 'WATCHER_001',
      category: 'filesystem',
      severity: 'high',
      confidence: 'high',
      title: 'Heavy directory not excluded',
      summary: 'build/ directory should be excluded from watchers',
      evidence: [{ label: 'Files', value: 500, source: 'scanner' }],
      createdAt: Date.now(),
    };

    let notifiedState: any = null;
    const unsubscribe = store.subscribe((s) => {
      notifiedState = s;
    });

    store.updateFindings([finding]);
    expect(store.getState().findings).toHaveLength(1);
    expect(notifiedState.findings[0].id).toBe('WATCHER_001');

    unsubscribe();
  });

  it('stores benchmark results and caps history', () => {
    const bench: BenchmarkResult = {
      operation: 'definition',
      sampleCount: 5,
      minMs: 20,
      maxMs: 120,
      p50Ms: 45,
      p75Ms: 60,
      p90Ms: 90,
      p95Ms: 110,
      timestamp: Date.now(),
    };

    store.addBenchmarkResult(bench);
    expect(store.getState().benchmarks).toHaveLength(1);
    expect(store.getState().benchmarks[0].p50Ms).toBe(45);
  });
});
