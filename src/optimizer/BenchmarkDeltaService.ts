import { BenchmarkResult } from '../benchmark/benchmarkTypes';

export interface BenchmarkMetricDelta {
  metricName: string;
  preValue: number;
  postValue: number;
  delta: number;
  percentageChange: number;
  isImprovement: boolean;
  isRegression: boolean;
  formattedDelta: string;
}

export interface BenchmarkComparison {
  operation: string;
  preBenchmark: BenchmarkResult;
  postBenchmark: BenchmarkResult;
  p50Delta: BenchmarkMetricDelta;
  p95Delta: BenchmarkMetricDelta;
  isOverallImprovement: boolean;
  isRegression: boolean;
  summary: string;
  honestyAssessment: string;
}

export class BenchmarkDeltaService {
  public static computeMetricDelta(
    metricName: string,
    pre: number,
    post: number,
    unit = 'ms'
  ): BenchmarkMetricDelta {
    const delta = Number((post - pre).toFixed(2));
    const percentageChange = pre > 0 ? Number((((post - pre) / pre) * 100).toFixed(1)) : 0;
    const isImprovement = delta < 0;
    const isRegression = delta > 0;

    let formattedDelta: string;
    if (isImprovement) {
      formattedDelta = `${delta}${unit} (${percentageChange}%)`;
    } else if (isRegression) {
      formattedDelta = `+${delta}${unit} (+${percentageChange}%)`;
    } else {
      formattedDelta = `0${unit} (0%)`;
    }

    return {
      metricName,
      preValue: pre,
      postValue: post,
      delta,
      percentageChange,
      isImprovement,
      isRegression,
      formattedDelta,
    };
  }

  public static compare(pre: BenchmarkResult, post: BenchmarkResult): BenchmarkComparison {
    const p50Delta = this.computeMetricDelta('P50', pre.p50Ms, post.p50Ms);
    const p95Delta = this.computeMetricDelta('P95', pre.p95Ms, post.p95Ms);

    const isOverallImprovement = p50Delta.isImprovement;
    const isRegression = p50Delta.isRegression;

    let summary = '';
    let honestyAssessment = '';

    if (isOverallImprovement) {
      const pct = Math.abs(p50Delta.percentageChange);
      summary = `Improved by ${Math.abs(p50Delta.delta)}ms (${pct}% faster)`;
      honestyAssessment = `Measurable improvement: P50 decreased from ${pre.p50Ms}ms to ${post.p50Ms}ms (${pct}% speedup).`;
    } else if (isRegression) {
      summary = `Regressed by +${p50Delta.delta}ms (+${p50Delta.percentageChange}% slower)`;
      honestyAssessment = `Performance regressed: P50 increased from ${pre.p50Ms}ms to ${post.p50Ms}ms (+${p50Delta.percentageChange}% slower). Reverting the change may be advisable.`;
    } else {
      summary = 'No measurable change';
      honestyAssessment = `No significant difference in latency observed (P50: ${post.p50Ms}ms).`;
    }

    return {
      operation: post.operation || pre.operation,
      preBenchmark: pre,
      postBenchmark: post,
      p50Delta,
      p95Delta,
      isOverallImprovement,
      isRegression,
      summary,
      honestyAssessment,
    };
  }
}
