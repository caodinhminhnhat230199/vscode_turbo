import { describe, it, expect } from 'vitest';
import { calculatePercentiles } from '../../../src/benchmark/Percentile';

describe('Percentile Calculations', () => {
  it('returns zeros for empty input', () => {
    const res = calculatePercentiles([]);
    expect(res).toEqual({
      min: 0,
      max: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
    });
  });

  it('handles single sample correctly', () => {
    const res = calculatePercentiles([42]);
    expect(res).toEqual({
      min: 42,
      max: 42,
      p50: 42,
      p75: 42,
      p90: 42,
      p95: 42,
    });
  });

  it('calculates percentiles for odd array lengths', () => {
    // 5 values: 10, 20, 30, 40, 50
    const res = calculatePercentiles([50, 10, 30, 20, 40]);
    expect(res.min).toBe(10);
    expect(res.max).toBe(50);
    expect(res.p50).toBe(30);
    expect(res.p75).toBe(40);
    expect(res.p90).toBe(50);
    expect(res.p95).toBe(50);
  });

  it('calculates percentiles for even array lengths', () => {
    // 6 values: 10, 20, 30, 40, 50, 60
    const res = calculatePercentiles([60, 20, 10, 50, 40, 30]);
    expect(res.min).toBe(10);
    expect(res.max).toBe(60);
    expect(res.p50).toBe(35); // average of 30 and 40
    expect(res.p75).toBe(50);
    expect(res.p90).toBe(60);
    expect(res.p95).toBe(60);
  });

  it('handles heavily skewed distributions', () => {
    // 100 values: 90 fast (10ms), 10 very slow (2000ms)
    const samples = [...Array(90).fill(10), ...Array(10).fill(2000)];
    const res = calculatePercentiles(samples);
    expect(res.min).toBe(10);
    expect(res.max).toBe(2000);
    expect(res.p50).toBe(10);
    expect(res.p75).toBe(10);
    expect(res.p90).toBe(10);
    expect(res.p95).toBe(2000);
  });
});
