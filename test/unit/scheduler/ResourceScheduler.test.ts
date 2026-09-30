import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResourceScheduler } from '../../../src/scheduler/ResourceScheduler';
import { JobPriority, ScheduledJob } from '../../../src/scheduler/JobTypes';

describe('ResourceScheduler', () => {
  let scheduler: ResourceScheduler;

  beforeEach(() => {
    scheduler = new ResourceScheduler({
      workerPoolOptions: { maxWorkers: 2 },
    });
  });

  afterEach(() => {
    scheduler.dispose();
  });

  it('schedules and executes jobs asynchronously', async () => {
    const job: ScheduledJob<string> = {
      id: 'test-job-1',
      priority: JobPriority.P1_NAVIGATION,
      type: 'navigation_definition',
      execute: async () => 'result-1',
    };

    const result = await scheduler.schedule(job);
    expect(result).toBe('result-1');

    const metrics = scheduler.getMetrics();
    expect(metrics.totalScheduled).toBe(1);
    expect(metrics.totalCompleted).toBe(1);
    expect(metrics.totalFailed).toBe(0);
  });

  it('prioritizes P0 interactive search over lower priority jobs', async () => {
    const executionOrder: string[] = [];

    // Pause all so we can enqueue in bulk, then resume
    scheduler.pause();

    const lowJob: ScheduledJob<void> = {
      id: 'low-job',
      priority: JobPriority.P4_WARMUP,
      type: 'warmup_task',
      execute: async () => {
        executionOrder.push('low');
      },
    };

    const highJob: ScheduledJob<void> = {
      id: 'high-job',
      priority: JobPriority.P0_INTERACTIVE_SEARCH,
      type: 'search_file',
      execute: async () => {
        executionOrder.push('high');
      },
    };

    const pLow = scheduler.schedule(lowJob);
    const pHigh = scheduler.schedule(highJob);

    scheduler.resume();

    await Promise.all([pLow, pHigh]);
    expect(executionOrder[0]).toBe('high');
    expect(executionOrder[1]).toBe('low');
  });

  it('cancels pending job by ID', async () => {
    scheduler.pause();

    const job: ScheduledJob<void> = {
      id: 'cancel-me',
      priority: JobPriority.P2_INCREMENTAL_INDEX,
      type: 'index_incremental',
      execute: async () => {},
    };

    const promise = scheduler.schedule(job);
    const cancelled = scheduler.cancel('cancel-me');
    expect(cancelled).toBe(true);

    await expect(promise).rejects.toThrow();
    expect(scheduler.getMetrics().totalCancelled).toBe(1);
    expect((scheduler as any).cancelledJobs.size).toBe(0);
  });

  it('cancels pending jobs by group ID', async () => {
    scheduler.pause();

    const job1: ScheduledJob<void> = {
      id: 'g-job-1',
      groupId: 'search-session-123',
      priority: JobPriority.P0_INTERACTIVE_SEARCH,
      type: 'search_file',
      execute: async () => {},
    };

    const job2: ScheduledJob<void> = {
      id: 'g-job-2',
      groupId: 'search-session-123',
      priority: JobPriority.P0_INTERACTIVE_SEARCH,
      type: 'search_symbol',
      execute: async () => {},
    };

    const p1 = scheduler.schedule(job1);
    const p2 = scheduler.schedule(job2);

    const cancelledCount = scheduler.cancelByGroup('search-session-123');
    expect(cancelledCount).toBe(2);

    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();
  });

  it('signals cancellation to an already running job', async () => {
    let observedCancellation = false;
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => {
      started = resolve;
    });
    const job: ScheduledJob<void> = {
      id: 'running-job',
      groupId: 'running-group',
      priority: JobPriority.P0_INTERACTIVE_SEARCH,
      type: 'search_file',
      execute: async (token) => {
        started();
        await new Promise((resolve) => setTimeout(resolve, 10));
        observedCancellation = token?.isCancellationRequested === true;
      },
    };

    const promise = scheduler.schedule(job);
    await didStart;
    expect(scheduler.cancelByGroup('running-group')).toBe(1);
    await expect(promise).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(observedCancellation).toBe(true);
    expect(scheduler.getMetrics().totalCancelled).toBe(1);
    expect(scheduler.getMetrics().totalCompleted).toBe(0);
  });

  it('records metrics when worker throws error', async () => {
    const errorJob: ScheduledJob<void> = {
      id: 'err-job',
      priority: JobPriority.P3_USER_TRIGGERED_DIAGNOSTIC,
      type: 'diagnostic_run',
      execute: async () => {
        throw new Error('Test job explosion');
      },
    };

    await expect(scheduler.schedule(errorJob)).rejects.toThrow('Test job explosion');
    expect(scheduler.getMetrics().totalFailed).toBe(1);
  });
});
