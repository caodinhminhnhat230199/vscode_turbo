import { metricsService } from '../../core/metrics/MetricsService';

export interface SearchLatencyBreakdown {
  query: string;
  mode: string;
  parseMs: number;
  fetchMs: number;
  rankingMs: number;
  mergeMs: number;
  totalMs: number;
  resultCount: number;
  cacheHit?: boolean;
}

export interface SearchDiagnosticsReport {
  totalQueries: number;
  cacheHits: number;
  cacheHitRate: number;
  cancellations: number;
  slowQueryCount: number;
  latencyStats: {
    total?: { p50: number; p95: number; count: number };
    fetch?: { p50: number; p95: number; count: number };
    ranking?: { p50: number; p95: number; count: number };
  };
  slowQueries: SearchLatencyBreakdown[];
  recentQueries: SearchLatencyBreakdown[];
}

export class SearchDiagnostics {
  private static instance: SearchDiagnostics | null = null;
  private slowQueries: SearchLatencyBreakdown[] = [];
  private recentQueries: SearchLatencyBreakdown[] = [];
  private slowThresholdMs = 100; // Log slow queries above 100ms
  private totalQueries = 0;
  private cacheHits = 0;
  private cancellations = 0;

  public static getInstance(): SearchDiagnostics {
    if (!SearchDiagnostics.instance) {
      SearchDiagnostics.instance = new SearchDiagnostics();
    }
    return SearchDiagnostics.instance;
  }

  public recordQuery(breakdown: SearchLatencyBreakdown): void {
    this.totalQueries++;
    if (breakdown.cacheHit) {
      this.cacheHits++;
    }

    metricsService.recordHistogram('search.total_latency_ms', breakdown.totalMs, {
      mode: breakdown.mode,
    });
    metricsService.recordHistogram('search.fetch_latency_ms', breakdown.fetchMs, {
      mode: breakdown.mode,
    });
    metricsService.recordHistogram('search.ranking_latency_ms', breakdown.rankingMs, {
      mode: breakdown.mode,
    });
    metricsService.recordHistogram('search.parse_latency_ms', breakdown.parseMs, {
      mode: breakdown.mode,
    });
    metricsService.recordHistogram('search.merge_latency_ms', breakdown.mergeMs, {
      mode: breakdown.mode,
    });

    this.recentQueries.push(breakdown);
    if (this.recentQueries.length > 50) {
      this.recentQueries.shift();
    }

    if (breakdown.totalMs >= this.slowThresholdMs) {
      this.slowQueries.push(breakdown);
      if (this.slowQueries.length > 50) {
        this.slowQueries.shift();
      }
    }
  }

  public recordCancellation(): void {
    this.cancellations++;
    metricsService.increment('search.cancellations');
  }

  public getSlowQueries(): SearchLatencyBreakdown[] {
    return [...this.slowQueries];
  }

  public getRecentQueries(): SearchLatencyBreakdown[] {
    return [...this.recentQueries];
  }

  public getLatencyStats(): {
    total?: { p50: number; p95: number; count: number };
    fetch?: { p50: number; p95: number; count: number };
    ranking?: { p50: number; p95: number; count: number };
  } {
    const total = metricsService.getHistogram('search.total_latency_ms');
    const fetch = metricsService.getHistogram('search.fetch_latency_ms');
    const ranking = metricsService.getHistogram('search.ranking_latency_ms');

    return {
      total: total ? { p50: total.p50, p95: total.p95, count: total.count } : undefined,
      fetch: fetch ? { p50: fetch.p50, p95: fetch.p95, count: fetch.count } : undefined,
      ranking: ranking ? { p50: ranking.p50, p95: ranking.p95, count: ranking.count } : undefined,
    };
  }

  public getReport(): SearchDiagnosticsReport {
    return {
      totalQueries: this.totalQueries,
      cacheHits: this.cacheHits,
      cacheHitRate: this.totalQueries > 0 ? this.cacheHits / this.totalQueries : 0,
      cancellations: this.cancellations,
      slowQueryCount: this.slowQueries.length,
      latencyStats: this.getLatencyStats(),
      slowQueries: this.getSlowQueries(),
      recentQueries: this.getRecentQueries(),
    };
  }

  public clear(): void {
    this.slowQueries = [];
    this.recentQueries = [];
    this.totalQueries = 0;
    this.cacheHits = 0;
    this.cancellations = 0;
  }
}

export const searchDiagnostics = SearchDiagnostics.getInstance();
