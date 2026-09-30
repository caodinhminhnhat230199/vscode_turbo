import { describe, it, expect, beforeEach } from 'vitest';
import { SearchDiagnostics } from '../../../src/search/diagnostics/SearchDiagnostics';

describe('SearchDiagnostics', () => {
  let diagnostics: SearchDiagnostics;

  beforeEach(() => {
    diagnostics = new SearchDiagnostics();
  });

  it('records queries and tracks slow query threshold', () => {
    diagnostics.recordQuery({
      query: 'fast',
      mode: 'file',
      parseMs: 0.1,
      fetchMs: 1.0,
      rankingMs: 0.5,
      mergeMs: 0.2,
      totalMs: 1.8,
      resultCount: 5,
    });

    diagnostics.recordQuery({
      query: 'slow',
      mode: 'all',
      parseMs: 0.5,
      fetchMs: 120.0,
      rankingMs: 10.0,
      mergeMs: 5.0,
      totalMs: 135.5,
      resultCount: 50,
    });

    const slow = diagnostics.getSlowQueries();
    expect(slow.length).toBe(1);
    expect(slow[0].query).toBe('slow');

    const stats = diagnostics.getLatencyStats();
    expect(stats.total).toBeDefined();
    expect(stats.total?.count).toBeGreaterThanOrEqual(2);
  });

  it('generates comprehensive report including cache and cancellation metrics', () => {
    diagnostics.recordQuery({
      query: 'hit',
      mode: 'file',
      parseMs: 0.1,
      fetchMs: 0,
      rankingMs: 0,
      mergeMs: 0,
      totalMs: 0.5,
      resultCount: 10,
      cacheHit: true,
    });

    diagnostics.recordQuery({
      query: 'miss',
      mode: 'file',
      parseMs: 0.2,
      fetchMs: 5.0,
      rankingMs: 1.0,
      mergeMs: 0,
      totalMs: 6.5,
      resultCount: 10,
      cacheHit: false,
    });

    diagnostics.recordCancellation();

    const report = diagnostics.getReport();
    expect(report.totalQueries).toBe(2);
    expect(report.cacheHits).toBe(1);
    expect(report.cacheHitRate).toBe(0.5);
    expect(report.cancellations).toBe(1);
    expect(report.recentQueries).toHaveLength(2);
  });
});
