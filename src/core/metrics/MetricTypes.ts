export type MetricTags = Record<string, string | number | boolean>;

export interface HistogramStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface MetricEntry<T = number> {
  name: string;
  value: T;
  timestamp: number;
  tags?: MetricTags;
}

export interface MetricsSnapshot {
  timestamp: number;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramStats>;
  memoryEstimateBytes?: number;
}
