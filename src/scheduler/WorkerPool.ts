import * as os from 'os';
import * as vscode from 'vscode';
import { ScheduledJob } from './JobTypes';
import { logger } from '../core/logging/Logger';
import { createCancellationError } from '../core/cancellation/CancellationManager';

export interface WorkerPoolOptions {
  maxWorkers?: number;
  minWorkers?: number;
}

export class WorkerPool implements vscode.Disposable {
  private maxWorkers: number;
  private minWorkers: number;
  private activeWorkers = 0;
  private isDisposed = false;

  constructor(options?: WorkerPoolOptions) {
    const cpuCount = typeof os.cpus === 'function' ? os.cpus()?.length || 4 : 4;
    // Cap default workers to avoid overwhelming Extension Host or VS Code thread
    this.maxWorkers = options?.maxWorkers ?? Math.max(1, Math.min(cpuCount - 1, 4));
    this.minWorkers = options?.minWorkers ?? 1;
  }

  public get capacity(): number {
    return this.maxWorkers;
  }

  public setCapacity(newMax: number): void {
    this.maxWorkers = Math.max(this.minWorkers, newMax);
  }

  public get activeCount(): number {
    return this.activeWorkers;
  }

  public get hasAvailableSlots(): boolean {
    return !this.isDisposed && this.activeWorkers < this.maxWorkers;
  }

  public async run<T>(job: ScheduledJob<T>, token?: vscode.CancellationToken): Promise<T> {
    if (this.isDisposed) {
      throw new Error(`WorkerPool is disposed. Cannot execute job ${job.id}`);
    }

    this.activeWorkers++;
    const startTime = performance.now();

    try {
      if (token?.isCancellationRequested) {
        throw createCancellationError();
      }

      const result = await job.execute(token);
      return result;
    } catch (error) {
      if (token?.isCancellationRequested) {
        throw createCancellationError();
      }
      logger.error(`Job [${job.id}:${job.type}] failed in WorkerPool`, error, {
        jobId: job.id,
        jobType: job.type,
        priority: job.priority,
        durationMs: performance.now() - startTime,
      });
      throw error;
    } finally {
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
  }
}
