import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsService } from '../../../../src/core/metrics/MetricsService';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('increments counters and sets gauges', () => {
    metrics.increment('test.counter');
    metrics.increment('test.counter', 4);
    metrics.gauge('test.gauge', 42);

    const snapshot = metrics.getSnapshot();
    expect(snapshot.counters['test.counter']).toBe(5);
    expect(snapshot.gauges['test.gauge']).toBe(42);
  });

  it('records timers and computes percentile statistics', () => {
    const endTimer = metrics.startTimer('test.timer');
    // Simulate some work
    for (let i = 0; i < 100000; i++) {
      // noop
    }
    const duration = endTimer();
    expect(duration).toBeGreaterThanOrEqual(0);

    // Record artificial distribution
    for (let i = 1; i <= 100; i++) {
      metrics.recordHistogram('latencies', i);
    }

    const stats = metrics.getHistogram('latencies');
    expect(stats).toBeDefined();
    expect(stats?.count).toBe(100);
    expect(stats?.min).toBe(1);
    expect(stats?.max).toBe(100);
    expect(stats?.avg).toBe(50.5);
    expect(stats?.p50).toBe(51);
    expect(stats?.p90).toBe(91);
    expect(stats?.p95).toBe(96);
    expect(stats?.p99).toBe(100);
  });

  it('clears all recorded metrics', () => {
    metrics.increment('counter');
    metrics.gauge('gauge', 10);
    metrics.recordHistogram('hist', 5);

    metrics.clear();
    const snapshot = metrics.getSnapshot();
    expect(Object.keys(snapshot.counters).length).toBe(0);
    expect(Object.keys(snapshot.gauges).length).toBe(0);
    expect(Object.keys(snapshot.histograms).length).toBe(0);
  });
});
