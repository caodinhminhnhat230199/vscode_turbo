import { describe, it, expect } from 'vitest';
import { BenchmarkDeltaService } from '../../../src/optimizer/BenchmarkDeltaService';
import { BenchmarkResult } from '../../../src/benchmark/benchmarkTypes';

describe('BenchmarkDeltaService', () => {
  const baseResult: BenchmarkResult = {
    operation: 'definition',
    sampleCount: 5,
    minMs: 50,
    maxMs: 250,
    p50Ms: 100,
    p75Ms: 120,
    p90Ms: 180,
    p95Ms: 220,
    timestamp: Date.now(),
  };

  it('computes improvement delta correctly', () => {
    const pre = { ...baseResult, p50Ms: 200, p95Ms: 400 };
    const post = { ...baseResult, p50Ms: 120, p95Ms: 260 };

    const comp = BenchmarkDeltaService.compare(pre, post);
    expect(comp.isOverallImprovement).toBe(true);
    expect(comp.isRegression).toBe(false);
    expect(comp.p50Delta.delta).toBe(-80);
    expect(comp.p50Delta.percentageChange).toBe(-40);
    expect(comp.summary).toContain('40% faster');
    expect(comp.honestyAssessment).toContain('P50 decreased from 200ms to 120ms');
  });

  it('handles regression honestly without misleading claims', () => {
    const pre = { ...baseResult, p50Ms: 100, p95Ms: 200 };
    const post = { ...baseResult, p50Ms: 145, p95Ms: 280 };

    const comp = BenchmarkDeltaService.compare(pre, post);
    expect(comp.isOverallImprovement).toBe(false);
    expect(comp.isRegression).toBe(true);
    expect(comp.p50Delta.delta).toBe(45);
    expect(comp.p50Delta.percentageChange).toBe(45);
    expect(comp.summary).toContain('Regressed by +45ms');
    expect(comp.honestyAssessment).toContain('Performance regressed');
    expect(comp.honestyAssessment).toContain('Reverting the change may be advisable');
  });

  it('handles identical metrics gracefully', () => {
    const pre = { ...baseResult, p50Ms: 100, p95Ms: 200 };
    const post = { ...baseResult, p50Ms: 100, p95Ms: 200 };

    const comp = BenchmarkDeltaService.compare(pre, post);
    expect(comp.isOverallImprovement).toBe(false);
    expect(comp.isRegression).toBe(false);
    expect(comp.p50Delta.delta).toBe(0);
    expect(comp.summary).toBe('No measurable change');
  });
});
