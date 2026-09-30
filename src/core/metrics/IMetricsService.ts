import { HistogramStats, MetricTags, MetricsSnapshot } from './MetricTypes';

export interface IMetricsService {
  startTimer(name: string, tags?: MetricTags): () => number;
  recordHistogram(name: string, value: number, tags?: MetricTags): void;
  increment(name: string, amount?: number, tags?: MetricTags): void;
  gauge(name: string, value: number, tags?: MetricTags): void;
  getHistogram(name: string): HistogramStats | undefined;
  getSnapshot(): MetricsSnapshot;
  clear(): void;
}
