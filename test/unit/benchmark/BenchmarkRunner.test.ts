import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../../../src/benchmark/BenchmarkRunner';

describe('BenchmarkRunner', () => {
  it('excludes warmup iterations from statistical percentiles', async () => {
    const runner = new BenchmarkRunner();
    let count = 0;

    const result = await runner.run({
      operation: 'test-warmup-exclusion',
      iterations: 3,
      warmupIterations: 2,
      execute: async (iter) => {
        count++;
        // Warmup iterations take 1000ms, measured iterations take 50ms
        const isWarmup = iter < 2;
        return {
          resultCount: 1,
          mockDuration: isWarmup ? 1000 : 50,
        };
      },
    });

    expect(count).toBe(5);
    expect(result.sampleCount).toBe(3); // only 3 measured samples
    expect(result.samples).toHaveLength(5);
    expect(result.samples!.filter((s) => s.isWarmup)).toHaveLength(2);
    expect(result.samples!.filter((s) => !s.isWarmup)).toHaveLength(3);
    // The measured durations are ~0-10ms (fast in-memory execute), far lower than 1000ms
    expect(result.p50Ms).toBeLessThan(500);
  });

  it('enforces concurrency mutex preventing overlapping runs for the same operation', async () => {
    const runner = new BenchmarkRunner();

    let resolveTask: (() => void) | undefined;
    const taskPromise = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });

    const runPromise = runner.run({
      operation: 'mutex-op',
      iterations: 1,
      warmupIterations: 0,
      execute: async () => {
        await taskPromise;
        return { resultCount: 1 };
      },
    });

    expect(runner.isRunning('mutex-op')).toBe(true);

    // Second call with same operation should throw
    await expect(
      runner.run({
        operation: 'mutex-op',
        iterations: 1,
        warmupIterations: 0,
        execute: async () => ({ resultCount: 1 }),
      })
    ).rejects.toThrow(/already running/);

    resolveTask?.();
    await runPromise;

    expect(runner.isRunning('mutex-op')).toBe(false);
  });

  it('respects timeout bounds when iteration hangs', async () => {
    const runner = new BenchmarkRunner();

    const result = await runner.run({
      operation: 'timeout-test',
      iterations: 1,
      warmupIterations: 0,
      timeoutMs: 50, // short timeout
      execute: async () => {
        // simulate hanging promise
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { resultCount: 1 };
      },
    });

    expect(result.timeoutCount).toBe(1);
    expect(result.samples![0].error).toContain('TIMEOUT');
  });

  it('supports cancellation during run', async () => {
    const runner = new BenchmarkRunner();
    let executedCount = 0;

    const runPromise = runner.run({
      operation: 'cancel-test',
      iterations: 5,
      warmupIterations: 0,
      execute: async () => {
        executedCount++;
        if (executedCount === 2) {
          runner.cancel('cancel-test');
        }
        return { resultCount: 1 };
      },
    });

    const result = await runPromise;
    expect(result.cancelled).toBe(true);
    expect(executedCount).toBeLessThan(5);
  });
});
