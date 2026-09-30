import { IResourceScheduler } from '../core/interfaces/IResourceScheduler';
import { JobPriority, ScheduledJob, JobExecutionStats } from './JobTypes';
import { PriorityQueue } from './PriorityQueue';
import { WorkerPool, WorkerPoolOptions } from './WorkerPool';
import { ResourceGovernor } from './ResourceGovernor';
import {
  cancellationManager,
  createCancellationError,
} from '../core/cancellation/CancellationManager';
import { metricsService } from '../core/metrics/MetricsService';
import { eventBus } from '../core/events/EventBus';
import { logger } from '../core/logging/Logger';

interface PendingJobRecord<T> {
  job: ScheduledJob<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  enqueuedAt: number;
}

export interface ResourceSchedulerOptions {
  workerPoolOptions?: WorkerPoolOptions;
}

export class ResourceScheduler implements IResourceScheduler {
  private static instance: ResourceScheduler | null = null;

  private queue = new PriorityQueue();
  private workerPool: WorkerPool;
  private governor: ResourceGovernor;
  private manuallyPausedPriorities = new Set<JobPriority>();
  private pendingResolvers = new Map<string, PendingJobRecord<unknown>>();
  private cancelledJobs = new Set<string>();

  // Statistics
  private totalScheduled = 0;
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalCancelled = 0;

  private isDisposed = false;
  private isProcessing = false;

  public static getInstance(options?: ResourceSchedulerOptions): ResourceScheduler {
    if (!ResourceScheduler.instance) {
      ResourceScheduler.instance = new ResourceScheduler(options);
    }
    return ResourceScheduler.instance;
  }

  constructor(options?: ResourceSchedulerOptions) {
    this.workerPool = new WorkerPool(options?.workerPoolOptions);
    this.governor = new ResourceGovernor();

    // Hook governor events
    this.governor.addListener({
      onPauseChange: (_priority, paused) => {
        if (!paused) {
          this.pumpQueue();
        }
      },
    });
  }

  public getGovernor(): ResourceGovernor {
    return this.governor;
  }

  public schedule<T>(job: ScheduledJob<T>): Promise<T> {
    if (this.isDisposed) {
      return Promise.reject(new Error(`Scheduler is disposed. Cannot schedule job ${job.id}`));
    }

    this.totalScheduled++;
    metricsService.increment('scheduler.job.scheduled', 1, {
      priority: job.priority,
      type: job.type,
    });
    eventBus.emit('jobScheduled', {
      jobId: job.id,
      priority: job.priority,
      type: job.type,
    });

    // Create cancellation token if job has id
    const tokenSource = cancellationManager.createTokenSource(job.id, job.groupId);

    // If P0 search job, notify governor
    if (job.priority === JobPriority.P0_INTERACTIVE_SEARCH) {
      this.governor.notifySearchStarted();
    }

    return new Promise<T>((resolve, reject) => {
      this.pendingResolvers.set(job.id, {
        job: job as ScheduledJob<unknown>,
        resolve: resolve as (val: unknown) => void,
        reject,
        enqueuedAt: performance.now(),
      });

      this.queue.enqueue(job);

      // Listen for manual token cancellation
      tokenSource.token.onCancellationRequested(() => {
        this.cancel(job.id);
      });

      this.pumpQueue();
    });
  }

  public cancel(jobId: string): boolean {
    const pending = this.pendingResolvers.get(jobId);
    if (!pending) {
      return false;
    }

    this.totalCancelled++;
    metricsService.increment('scheduler.job.cancelled', 1, {
      priority: pending.job.priority,
      type: pending.job.type,
    });

    const wasQueued = this.queue.remove(jobId);
    this.pendingResolvers.delete(jobId);
    this.cancelledJobs.add(jobId);
    cancellationManager.cancel(jobId);

    if (wasQueued && pending.job.priority === JobPriority.P0_INTERACTIVE_SEARCH) {
      this.governor.notifySearchEnded();
    }

    pending.reject(createCancellationError());
    if (wasQueued) {
      this.cancelledJobs.delete(jobId);
    }
    return true;
  }

  public cancelByGroup(groupId: string): number {
    let count = 0;
    for (const [id, pending] of Array.from(this.pendingResolvers.entries())) {
      if (pending.job.groupId === groupId) {
        if (this.cancel(id)) {
          count++;
        }
      }
    }
    return count;
  }

  public pause(priority?: JobPriority): void {
    if (priority !== undefined) {
      this.manuallyPausedPriorities.add(priority);
    } else {
      for (let p = 0; p <= JobPriority.P6_MAINTENANCE; p++) {
        this.manuallyPausedPriorities.add(p as JobPriority);
      }
    }
  }

  public resume(priority?: JobPriority): void {
    if (priority !== undefined) {
      this.manuallyPausedPriorities.delete(priority);
    } else {
      this.manuallyPausedPriorities.clear();
    }
    this.pumpQueue();
  }

  public isPaused(priority: JobPriority): boolean {
    return this.manuallyPausedPriorities.has(priority) || this.governor.isPriorityPaused(priority);
  }

  public getMetrics(): JobExecutionStats {
    const paused = new Set<JobPriority>([
      ...this.manuallyPausedPriorities,
      ...this.governor.getPausedPriorities(),
    ]);

    return {
      totalScheduled: this.totalScheduled,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalCancelled: this.totalCancelled,
      queueLength: this.queue.size,
      activeWorkers: this.workerPool.activeCount,
      pausedPriorities: Array.from(paused),
    };
  }

  private pumpQueue(): void {
    if (this.isProcessing || this.isDisposed) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.workerPool.hasAvailableSlots && !this.queue.isEmpty()) {
        const ignoredPriorities = new Set<JobPriority>([
          ...this.manuallyPausedPriorities,
          ...this.governor.getPausedPriorities(),
        ]);

        const nextJob = this.queue.dequeue(ignoredPriorities);
        if (!nextJob) {
          // No eligible job to run right now
          break;
        }

        const pending = this.pendingResolvers.get(nextJob.id);
        if (!pending) {
          continue;
        }

        // Run worker task asynchronously
        void this.executeJob(pending);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(pending: PendingJobRecord<unknown>): Promise<void> {
    const { job, resolve, reject, enqueuedAt } = pending;
    const queueLatency = performance.now() - enqueuedAt;
    metricsService.recordHistogram('scheduler.queue_latency_ms', queueLatency, {
      priority: job.priority,
      type: job.type,
    });

    const token = cancellationManager.getToken(job.id);
    const execTimer = metricsService.startTimer('scheduler.execution_duration_ms', {
      priority: job.priority,
      type: job.type,
    });

    try {
      const result = await this.workerPool.run(job, token);
      if (this.cancelledJobs.has(job.id)) {
        return;
      }
      const duration = execTimer();

      this.totalCompleted++;
      metricsService.increment('scheduler.job.completed', 1, {
        priority: job.priority,
        type: job.type,
      });
      eventBus.emit('jobCompleted', {
        jobId: job.id,
        durationMs: duration,
        success: true,
      });

      resolve(result);
    } catch (error) {
      const duration = execTimer();
      if (this.cancelledJobs.has(job.id)) {
        // cancel() already rejected the public promise and recorded metrics.
      } else if (token?.isCancellationRequested) {
        this.totalCancelled++;
        reject(createCancellationError());
      } else {
        this.totalFailed++;
        metricsService.increment('scheduler.job.failed', 1, {
          priority: job.priority,
          type: job.type,
        });
        eventBus.emit('jobCompleted', {
          jobId: job.id,
          durationMs: duration,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    } finally {
      this.pendingResolvers.delete(job.id);
      cancellationManager.disposeToken(job.id);
      this.cancelledJobs.delete(job.id);

      if (job.priority === JobPriority.P0_INTERACTIVE_SEARCH) {
        this.governor.notifySearchEnded();
      }

      // Check for more jobs in queue
      this.pumpQueue();
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.governor.dispose();
    this.workerPool.dispose();
    for (const [id, pending] of this.pendingResolvers.entries()) {
      cancellationManager.disposeToken(id);
      pending.reject(createCancellationError());
    }
    this.pendingResolvers.clear();
    this.queue.clear();
    logger.info('ResourceScheduler disposed');
  }
}

export const resourceScheduler = ResourceScheduler.getInstance();
