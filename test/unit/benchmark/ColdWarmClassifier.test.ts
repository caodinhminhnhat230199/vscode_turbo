import { describe, it, expect } from 'vitest';
import { ColdWarmClassifier } from '../../../src/benchmark/ColdWarmClassifier';
import { BenchmarkResult } from '../../../src/benchmark/benchmarkTypes';

function createMockResult(partial: Partial<BenchmarkResult>): BenchmarkResult {
  return {
    operation: 'definition',
    sampleCount: 5,
    minMs: 20,
    maxMs: 50,
    p50Ms: 30,
    p75Ms: 40,
    p90Ms: 45,
    p95Ms: 50,
    cold: false,
    timestamp: Date.now(),
    cancelled: false,
    timeoutCount: 0,
    errorCount: 0,
    samples: [
      { iteration: 0, durationMs: 30, resultCount: 1, isWarmup: true, timestamp: Date.now() },
      { iteration: 1, durationMs: 25, resultCount: 1, isWarmup: false, timestamp: Date.now() },
      { iteration: 2, durationMs: 30, resultCount: 1, isWarmup: false, timestamp: Date.now() },
    ],
    ...partial,
  };
}

describe('ColdWarmClassifier', () => {
  it('classifies PROVIDER_TIMEOUT when timeoutCount > 0', () => {
    const res = createMockResult({ timeoutCount: 1 });
    expect(ColdWarmClassifier.classify(res)).toBe('PROVIDER_TIMEOUT');
  });

  it('classifies NO_PROVIDER when sampleCount is 0 or all samples are errors', () => {
    const emptyRes = createMockResult({ sampleCount: 0 });
    expect(ColdWarmClassifier.classify(emptyRes)).toBe('NO_PROVIDER');

    const errRes = createMockResult({
      sampleCount: 2,
      errorCount: 2,
      samples: [
        {
          iteration: 0,
          durationMs: 5,
          resultCount: 0,
          isWarmup: false,
          timestamp: 0,
          error: 'err',
        },
        {
          iteration: 1,
          durationMs: 5,
          resultCount: 0,
          isWarmup: false,
          timestamp: 0,
          error: 'err',
        },
      ],
    });
    expect(ColdWarmClassifier.classify(errRes)).toBe('NO_PROVIDER');
  });

  it('classifies LANGUAGE_COLD_START when first sample is >= 2000ms and warm P50 is <= 300ms', () => {
    const res = createMockResult({
      p50Ms: 120,
      samples: [
        { iteration: 0, durationMs: 3200, resultCount: 1, isWarmup: true, timestamp: 0 },
        { iteration: 1, durationMs: 120, resultCount: 1, isWarmup: false, timestamp: 0 },
        { iteration: 2, durationMs: 110, resultCount: 1, isWarmup: false, timestamp: 0 },
      ],
    });
    expect(ColdWarmClassifier.classify(res)).toBe('LANGUAGE_COLD_START');
  });

  it('classifies LANGUAGE_PERSISTENT_SLOW when warm P50 > 800ms', () => {
    const res = createMockResult({
      p50Ms: 1450,
      samples: [
        { iteration: 0, durationMs: 1500, resultCount: 1, isWarmup: true, timestamp: 0 },
        { iteration: 1, durationMs: 1450, resultCount: 1, isWarmup: false, timestamp: 0 },
      ],
    });
    expect(ColdWarmClassifier.classify(res)).toBe('LANGUAGE_PERSISTENT_SLOW');
  });

  it('classifies OPTIMAL when latency is within normal thresholds', () => {
    const res = createMockResult({
      p50Ms: 65,
      samples: [
        { iteration: 0, durationMs: 90, resultCount: 1, isWarmup: true, timestamp: 0 },
        { iteration: 1, durationMs: 65, resultCount: 1, isWarmup: false, timestamp: 0 },
      ],
    });
    expect(ColdWarmClassifier.classify(res)).toBe('OPTIMAL');
  });

  it('respects custom threshold overrides', () => {
    const res = createMockResult({
      p50Ms: 400,
      samples: [{ iteration: 0, durationMs: 400, resultCount: 1, isWarmup: false, timestamp: 0 }],
    });
    // With custom threshold of 350ms, 400ms is persistent slow
    expect(ColdWarmClassifier.classify(res, { persistentSlowMs: 350 })).toBe(
      'LANGUAGE_PERSISTENT_SLOW'
    );
  });
});
