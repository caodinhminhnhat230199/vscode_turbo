import * as vscode from 'vscode';
import { BenchmarkResult, BenchmarkRunOptions, BenchmarkSample } from './benchmarkTypes';
import { calculatePercentiles } from './Percentile';

export class BenchmarkRunner {
  private activeOperations = new Set<string>();
  private activeCts = new Map<string, vscode.CancellationTokenSource>();

  public isRunning(operation: string): boolean {
    return this.activeOperations.has(operation);
  }

  public cancel(operation?: string): void {
    if (operation) {
      const cts = this.activeCts.get(operation);
      if (cts) {
        cts.cancel();
      }
    } else {
      for (const cts of this.activeCts.values()) {
        cts.cancel();
      }
    }
  }

  public async run(options: BenchmarkRunOptions): Promise<BenchmarkResult> {
    const { operation } = options;
    if (this.activeOperations.has(operation)) {
      throw new Error(`Benchmark operation "${operation}" is already running.`);
    }

    const cts = new vscode.CancellationTokenSource();
    this.activeOperations.add(operation);
    this.activeCts.set(operation, cts);

    const mergedToken = options.token ?? cts.token;
    const runOptions: BenchmarkRunOptions = {
      ...options,
      token: mergedToken,
    };

    try {
      return await this.executeInternal(runOptions);
    } finally {
      this.activeOperations.delete(operation);
      this.activeCts.delete(operation);
      cts.dispose();
    }
  }

  private async executeInternal(options: BenchmarkRunOptions): Promise<BenchmarkResult> {
    const warmupCount = options.warmupIterations ?? 1;
    const iterationCount = options.iterations ?? 5;
    const timeoutMs = options.timeoutMs ?? 5000;
    const token = options.token;

    const allSamples: BenchmarkSample[] = [];
    const timedDurations: number[] = [];
    let timeoutCount = 0;
    let errorCount = 0;
    let isCancelled = false;

    // 1. Warmup iterations (excluded from statistical percentiles)
    for (let i = 0; i < warmupCount; i++) {
      if (token?.isCancellationRequested) {
        isCancelled = true;
        break;
      }
      try {
        const { durationMs, resultCount } = await this.runWithTimeout(
          () => options.execute(i),
          timeoutMs
        );
        allSamples.push({
          iteration: i,
          durationMs,
          resultCount,
          isWarmup: true,
          timestamp: Date.now(),
        });
      } catch (err: unknown) {
        const errorMsg = String(err);
        if (errorMsg.includes('TIMEOUT')) {
          timeoutCount++;
        } else {
          errorCount++;
        }
        allSamples.push({
          iteration: i,
          durationMs: timeoutMs,
          resultCount: 0,
          isWarmup: true,
          timestamp: Date.now(),
          error: errorMsg,
        });
      }
    }

    // 2. Timed measured iterations
    if (!isCancelled) {
      for (let i = 0; i < iterationCount; i++) {
        if (token?.isCancellationRequested) {
          isCancelled = true;
          break;
        }
        try {
          const { durationMs, resultCount } = await this.runWithTimeout(
            () => options.execute(warmupCount + i),
            timeoutMs
          );
          allSamples.push({
            iteration: warmupCount + i,
            durationMs,
            resultCount,
            isWarmup: false,
            timestamp: Date.now(),
          });
          timedDurations.push(durationMs);
        } catch (err: unknown) {
          const errorMsg = String(err);
          if (errorMsg.includes('TIMEOUT')) {
            timeoutCount++;
          } else {
            errorCount++;
          }
          allSamples.push({
            iteration: warmupCount + i,
            durationMs: timeoutMs,
            resultCount: 0,
            isWarmup: false,
            timestamp: Date.now(),
            error: errorMsg,
          });
        }
      }
    }

    const percentiles = calculatePercentiles(timedDurations);

    // Heuristic cold start check: first warmup sample took significantly longer than median warm sample
    const isCold =
      warmupCount > 0 &&
      allSamples.length > 0 &&
      timedDurations.length > 0 &&
      allSamples[0].durationMs > percentiles.p50 * 2 &&
      allSamples[0].durationMs > 1000;

    return {
      operation: options.operation,
      sampleCount: timedDurations.length,
      minMs: percentiles.min,
      maxMs: percentiles.max,
      p50Ms: percentiles.p50,
      p75Ms: percentiles.p75,
      p90Ms: percentiles.p90,
      p95Ms: percentiles.p95,
      cold: isCold,
      timestamp: Date.now(),
      cancelled: isCancelled,
      timeoutCount,
      errorCount,
      samples: allSamples,
      targetSymbol: options.targetSymbol,
      targetUri: options.targetUri,
    };
  }

  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<{ durationMs: number; resultCount: number }> {
    const t0 = performance.now();
    let timer: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    });

    try {
      const res = await Promise.race([fn(), timeoutPromise]);
      const durationMs = Math.round((performance.now() - t0) * 100) / 100;
      return {
        durationMs,
        resultCount: (res as any)?.resultCount ?? 0,
      };
    } finally {
      clearTimeout(timer!);
    }
  }
}

export const benchmarkRunner = new BenchmarkRunner();
