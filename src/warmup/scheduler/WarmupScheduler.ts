import * as vscode from 'vscode';
import { WarmupPriorityQueue } from '../queue/WarmupPriorityQueue';
import { WarmupTask } from '../models/WarmupTask';
import { ActivityMonitor, ActivityLevel } from '../activity/ActivityMonitor';
import { AdapterRegistry } from '../../index/adapters/AdapterRegistry';
import { Disposable } from '../../core/lifecycle/Disposable';
import { logger } from '../../core/logging/Logger';

export type SchedulerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface WarmupSchedulerOptions {
  concurrency?: number;
  activityMonitor?: ActivityMonitor;
  adapterRegistry?: AdapterRegistry;
  onStatusChange?: (status: SchedulerStatus, reason?: string) => void;
  onProgress?: (completed: number, total: number, currentUri?: vscode.Uri) => void;
}

export class WarmupScheduler extends Disposable {
  private status: SchedulerStatus = 'idle';
  private pauseReason?: string;
  private baseConcurrency: number;
  private concurrency: number;
  private activeWorkers = 0;
  private completedTasks = 0;
  private totalEnqueuedTasks = 0;
  private currentUri?: vscode.Uri;

  private readonly warmedFiles = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly queue: WarmupPriorityQueue;
  private readonly activityMonitor?: ActivityMonitor;
  private readonly adapterRegistry: AdapterRegistry;

  private readonly onStatusChangeCallback?: (status: SchedulerStatus, reason?: string) => void;
  private readonly onProgressCallback?: (
    completed: number,
    total: number,
    currentUri?: vscode.Uri
  ) => void;

  private cancellationTokenSource: vscode.CancellationTokenSource | null = null;
  private isProcessing = false;

  constructor(queue: WarmupPriorityQueue, options?: WarmupSchedulerOptions) {
    super();
    this.queue = queue;
    this.baseConcurrency = options?.concurrency ?? 2;
    this.concurrency = this.baseConcurrency;
    this.activityMonitor = options?.activityMonitor;
    this.adapterRegistry = options?.adapterRegistry ?? new AdapterRegistry();
    this.onStatusChangeCallback = options?.onStatusChange;
    this.onProgressCallback = options?.onProgress;

    if (this.activityMonitor) {
      this.register(
        this.activityMonitor.onDidChangeActivity((level) => {
          this.handleActivityChange(level);
        })
      );
    }
  }

  public getStatus(): SchedulerStatus {
    return this.status;
  }

  public getPauseReason(): string | undefined {
    return this.pauseReason;
  }

  public getConcurrency(): number {
    return this.concurrency;
  }

  public setConcurrency(concurrency: number): void {
    this.baseConcurrency = Math.max(1, concurrency);
    this.concurrency = this.baseConcurrency;
  }

  public getCompletedCount(): number {
    return this.completedTasks;
  }

  public getCurrentUri(): vscode.Uri | undefined {
    return this.currentUri;
  }

  public isFileWarmed(fsPath: string): boolean {
    return this.warmedFiles.has(this.normalizePath(fsPath));
  }

  public isTaskActive(fsPath: string): boolean {
    return this.inFlight.has(this.normalizePath(fsPath));
  }

  public markFileWarmed(fsPath: string): void {
    this.warmedFiles.add(this.normalizePath(fsPath));
  }

  public clearWarmedFiles(): void {
    this.warmedFiles.clear();
  }

  public start(): void {
    if (this.status === 'running') {
      return;
    }

    this.cancellationTokenSource = new vscode.CancellationTokenSource();
    this.totalEnqueuedTasks = this.completedTasks + this.queue.size();

    // Check if initial activity is high
    if (this.activityMonitor?.isHigh()) {
      this.setStatus('paused', 'User typing / active');
      return;
    }

    this.setStatus('running');
    this.drain();
  }

  public pause(reason = 'User requested'): void {
    if (this.status === 'running' || this.status === 'idle') {
      this.setStatus('paused', reason);
    }
  }

  public resume(): void {
    if (this.status === 'paused') {
      this.pauseReason = undefined;
      this.setStatus('running');
      this.drain();
    }
  }

  public cancel(): void {
    if (this.cancellationTokenSource) {
      this.cancellationTokenSource.cancel();
      this.cancellationTokenSource.dispose();
      this.cancellationTokenSource = null;
    }
    this.setStatus('idle');
    this.queue.clear();
    this.currentUri = undefined;
  }

  public enqueueAndDrain(task: WarmupTask): void {
    const key = this.normalizePath(task.uri.fsPath);
    if (this.warmedFiles.has(key)) {
      return;
    }

    this.queue.enqueue(task);
    this.totalEnqueuedTasks = this.completedTasks + this.queue.size();

    // If task is P0 or P1, it can preempt or trigger drain even if paused
    if (task.priority <= 1) {
      if (this.status === 'paused' && this.activityMonitor?.isHigh()) {
        // Run P0/P1 preemptively
        this.processPreemptiveTask(task);
        return;
      }
    }

    if (this.status === 'running' || this.status === 'idle') {
      if (this.status === 'idle') {
        this.setStatus('running');
      }
      this.drain();
    }
  }

  private handleActivityChange(level: ActivityLevel): void {
    if (level === 'high') {
      // User typing rapidly -> throttle background work
      this.concurrency = 1;
      if (this.status === 'running') {
        this.pause('User typing / active');
      }
    } else if (level === 'low') {
      // Moderate typing / CPU pressure proxy -> reduce concurrency
      this.concurrency = 1;
      if (this.status === 'paused' && this.pauseReason === 'User typing / active') {
        this.resume();
      }
    } else if (level === 'idle') {
      // Idle -> expand concurrency back to base concurrency
      this.concurrency = this.baseConcurrency;
      if (this.status === 'paused' && this.pauseReason === 'User typing / active') {
        this.resume();
      }
    }
  }

  private drain(): void {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      while (
        this.status === 'running' &&
        this.activeWorkers < this.concurrency &&
        !this.queue.isEmpty()
      ) {
        const task = this.queue.dequeue();
        if (!task) {
          break;
        }

        const normPath = this.normalizePath(task.uri.fsPath);
        if (this.warmedFiles.has(normPath)) {
          // Skip already warmed file
          continue;
        }

        this.spawnWorker(task);
      }

      if (this.queue.isEmpty() && this.activeWorkers === 0 && this.status === 'running') {
        this.setStatus('completed');
        this.currentUri = undefined;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private spawnWorker(task: WarmupTask): void {
    this.activeWorkers++;
    this.currentUri = task.uri;
    const norm = this.normalizePath(task.uri.fsPath);
    this.inFlight.add(norm);

    const token = this.cancellationTokenSource?.token;

    (async () => {
      try {
        if (!token?.isCancellationRequested) {
          const adapter = this.adapterRegistry.getAdapter(task.uri);
          if (adapter.warmup) {
            await adapter.warmup(task.uri, token);
          }
        }
        this.markFileWarmed(task.uri.fsPath);
        this.completedTasks++;
        this.onProgressCallback?.(this.completedTasks, this.totalEnqueuedTasks, task.uri);
      } catch (err) {
        logger.debug(`Error warming up task ${task.uri.fsPath}`, { error: String(err) });
      } finally {
        this.inFlight.delete(norm);
        this.activeWorkers--;
        // Continue draining
        if (this.status === 'running') {
          this.drain();
        } else if (
          this.queue.isEmpty() &&
          this.activeWorkers === 0 &&
          this.status !== 'paused' &&
          this.status !== 'idle'
        ) {
          this.setStatus('completed');
          this.currentUri = undefined;
        }
      }
    })();
  }

  private processPreemptiveTask(task: WarmupTask): void {
    // P0/P1 preemption: executes immediately even during high activity
    const normPath = this.normalizePath(task.uri.fsPath);
    if (this.warmedFiles.has(normPath)) {
      return;
    }

    // Remove from queue since we're executing it now
    this.queue.remove(task.uri.fsPath);
    this.markFileWarmed(task.uri.fsPath);
    this.activeWorkers++;
    this.currentUri = task.uri;

    (async () => {
      try {
        const adapter = this.adapterRegistry.getAdapter(task.uri);
        if (adapter.warmup) {
          await adapter.warmup(task.uri);
        }
        this.completedTasks++;
        this.onProgressCallback?.(this.completedTasks, this.totalEnqueuedTasks, task.uri);
      } catch (err) {
        logger.debug(`Error during preemptive warmup for ${task.uri.fsPath}`, {
          error: String(err),
        });
      } finally {
        this.activeWorkers--;
      }
    })();
  }

  private setStatus(newStatus: SchedulerStatus, reason?: string): void {
    this.status = newStatus;
    this.pauseReason = reason;
    this.onStatusChangeCallback?.(this.status, this.pauseReason);
  }

  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
  }

  public override dispose(): void {
    this.cancel();
    super.dispose();
  }
}
