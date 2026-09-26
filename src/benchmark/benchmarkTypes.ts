export type BenchmarkOperation =
  'definition' | 'references' | 'workspaceSymbols' | 'fileSearch' | 'textSearch' | (string & {});

export interface BenchmarkSample {
  iteration: number;
  durationMs: number;
  resultCount: number;
  isWarmup: boolean;
  timestamp: number;
  error?: string;
}

export type LatencyCategory =
  | 'OPTIMAL'
  | 'LANGUAGE_COLD_START'
  | 'LANGUAGE_PERSISTENT_SLOW'
  | 'PROVIDER_TIMEOUT'
  | 'NO_PROVIDER';

export interface BenchmarkResult {
  operation: BenchmarkOperation;
  sampleCount: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p75Ms: number;
  p90Ms: number;
  p95Ms: number;
  cold?: boolean;
  category?: LatencyCategory;
  timestamp: number;
  cancelled?: boolean;
  timeoutCount?: number;
  errorCount?: number;
  samples?: BenchmarkSample[];
  targetSymbol?: string;
  targetUri?: string;
}

export interface BenchmarkRunOptions {
  operation: BenchmarkOperation;
  warmupIterations?: number;
  iterations?: number;
  timeoutMs?: number;
  token?: { isCancellationRequested: boolean };
  execute: (iteration: number) => Promise<{ resultCount: number }>;
  targetSymbol?: string;
  targetUri?: string;
}
