export interface PercentileStats {
  min: number;
  max: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

/**
 * Computes a specific percentile from a sorted array using standard Nearest Rank method
 * with midpoint interpolation for P50 on even-length arrays.
 */
export function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0];
  }

  if (p === 50 && sorted.length % 2 === 0) {
    const mid = sorted.length / 2;
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.max(0, Math.min(rank - 1, sorted.length - 1));
  return sorted[index];
}

/**
 * Calculates min, max, P50, P75, P90, P95 from an array of sample numbers.
 */
export function calculatePercentiles(samples: number[]): PercentileStats {
  if (!samples || samples.length === 0) {
    return {
      min: 0,
      max: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    p50: Math.round(computePercentile(sorted, 50) * 100) / 100,
    p75: Math.round(computePercentile(sorted, 75) * 100) / 100,
    p90: Math.round(computePercentile(sorted, 90) * 100) / 100,
    p95: Math.round(computePercentile(sorted, 95) * 100) / 100,
  };
}
