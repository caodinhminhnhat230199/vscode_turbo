import { IMetricsService } from './IMetricsService';
import { HistogramStats, MetricTags, MetricsSnapshot } from './MetricTypes';

export class MetricsService implements IMetricsService {
  private static instance: MetricsService | null = null;

  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private readonly maxSamplesPerHistogram = 1000;

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public startTimer(name: string, tags?: MetricTags): () => number {
    const start = performance.now();
    return () => {
      const elapsed = performance.now() - start;
      this.recordHistogram(name, elapsed, tags);
      return elapsed;
    };
  }

  public recordHistogram(name: string, value: number, _tags?: MetricTags): void {
    let samples = this.histograms.get(name);
    if (!samples) {
      samples = [];
      this.histograms.set(name, samples);
    }
    if (samples.length >= this.maxSamplesPerHistogram) {
      // Reservoir sample or drop oldest
      samples.shift();
    }
    samples.push(value);
  }

  public increment(name: string, amount = 1, _tags?: MetricTags): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + amount);
  }

  public gauge(name: string, value: number, _tags?: MetricTags): void {
    this.gauges.set(name, value);
  }

  public getHistogram(name: string): HistogramStats | undefined {
    const samples = this.histograms.get(name);
    if (!samples || samples.length === 0) {
      return undefined;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / count;

    const p50 = sorted[Math.floor(count * 0.5)];
    const p90 = sorted[Math.min(count - 1, Math.floor(count * 0.9))];
    const p95 = sorted[Math.min(count - 1, Math.floor(count * 0.95))];
    const p99 = sorted[Math.min(count - 1, Math.floor(count * 0.99))];

    return { count, min, max, avg, p50, p90, p95, p99 };
  }

  public getSnapshot(): MetricsSnapshot {
    const countersRecord: Record<string, number> = {};
    for (const [key, val] of this.counters.entries()) {
      countersRecord[key] = val;
    }

    const gaugesRecord: Record<string, number> = {};
    for (const [key, val] of this.gauges.entries()) {
      gaugesRecord[key] = val;
    }

    const histogramsRecord: Record<string, HistogramStats> = {};
    for (const key of this.histograms.keys()) {
      const stats = this.getHistogram(key);
      if (stats) {
        histogramsRecord[key] = stats;
      }
    }

    const memEstimate =
      typeof process !== 'undefined' && process.memoryUsage
        ? process.memoryUsage().heapUsed
        : undefined;

    return {
      timestamp: Date.now(),
      counters: countersRecord,
      gauges: gaugesRecord,
      histograms: histogramsRecord,
      memoryEstimateBytes: memEstimate,
    };
  }

  public clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

export const metricsService = MetricsService.getInstance();
