import * as vscode from 'vscode';
import { WarmupPriorityQueue } from './queue/WarmupPriorityQueue';
import { ActivityMonitor } from './activity/ActivityMonitor';
import { WarmupScheduler, SchedulerStatus } from './scheduler/WarmupScheduler';
import {
  ActiveFileStrategy,
  EntryPointStrategy,
  GitChangedStrategy,
  RecentFilesStrategy,
  PredictiveWarmupStrategy,
} from './strategies';
import { stateStore } from '../core/state/StateStore';
import { StatusBarController } from '../vscode/statusBar';
import { ConfigService } from '../vscode/config';
import { Disposable } from '../core/lifecycle/Disposable';
import { logger } from '../core/logging/Logger';

export interface WarmupEngineOptions {
  memento?: vscode.Memento;
  configService?: ConfigService;
  activityMonitor?: ActivityMonitor;
}

export class WarmupEngine extends Disposable {
  private static instance: WarmupEngine | null = null;

  public readonly queue = new WarmupPriorityQueue();
  public readonly activityMonitor: ActivityMonitor;
  public readonly scheduler: WarmupScheduler;

  public readonly activeStrategy = new ActiveFileStrategy();
  public readonly entryPointStrategy = new EntryPointStrategy();
  public readonly gitChangedStrategy = new GitChangedStrategy();
  public readonly recentFilesStrategy: RecentFilesStrategy;
  public readonly predictiveStrategy = new PredictiveWarmupStrategy();

  private readonly configService: ConfigService;
  private startTime = 0;
  private isDiscovering = false;

  public static getInstance(options?: WarmupEngineOptions): WarmupEngine {
    if (!WarmupEngine.instance) {
      WarmupEngine.instance = new WarmupEngine(options);
    }
    return WarmupEngine.instance;
  }

  constructor(options?: WarmupEngineOptions) {
    super();
    this.configService = options?.configService ?? ConfigService.getInstance();
    this.activityMonitor = options?.activityMonitor ?? new ActivityMonitor();
    this.register(this.activityMonitor);

    this.recentFilesStrategy = new RecentFilesStrategy({ memento: options?.memento });
    this.register(this.recentFilesStrategy);

    const config = this.configService.getConfig();
    this.scheduler = new WarmupScheduler(this.queue, {
      concurrency: config.warmupConcurrency,
      activityMonitor: this.activityMonitor,
      onStatusChange: (status, reason) => this.handleSchedulerStatusChange(status, reason),
      onProgress: (completed, total, currentUri) =>
        this.handleSchedulerProgress(completed, total, currentUri),
    });
    this.register(this.scheduler);

    this.registerListeners();
  }

  public async startWarmup(cancellationToken?: vscode.CancellationToken): Promise<void> {
    const config = this.configService.getConfig();
    if (!config.warmupEnabled) {
      logger.info('Warmup engine is disabled in configuration');
      return;
    }

    if (this.isDiscovering) {
      return;
    }

    this.isDiscovering = true;
    this.startTime = Date.now();
    logger.info('Starting warmup discovery and scheduling pipeline');

    try {
      stateStore.updateWarmupStatus({
        status: 'running',
        queueSize: this.queue.size(),
        completedTasks: this.scheduler.getCompletedCount(),
        concurrency: this.scheduler.getConcurrency(),
        elapsedTimeMs: 0,
      });

      const discoveryContext = {
        workspaceFolders: vscode.workspace.workspaceFolders,
        cancellationToken,
      };

      // 1. P0: Active File Strategy
      const activeTasks = await this.activeStrategy.discover(discoveryContext);
      this.queue.enqueueBatch(activeTasks);

      // 2. P1: Entry Point Strategy
      const entryTasks = await this.entryPointStrategy.discover(discoveryContext);
      this.queue.enqueueBatch(entryTasks);

      // 2b. Predictive Strategy (Active file dependencies)
      const predictiveTasks = await this.predictiveStrategy.discover(discoveryContext);
      this.queue.enqueueBatch(predictiveTasks);

      // 3. P2: Git Changed Strategy
      if (config.warmupUseGitChanges) {
        const gitTasks = await this.gitChangedStrategy.discover(discoveryContext);
        this.queue.enqueueBatch(gitTasks);
      }

      // 4. P3: Recent Files Strategy
      if (config.warmupUseRecentFiles) {
        const recentTasks = await this.recentFilesStrategy.discover(discoveryContext);
        this.queue.enqueueBatch(recentTasks);
      }

      logger.info(`Warmup discovery complete. Enqueued ${this.queue.size()} tasks.`);

      stateStore.updateWarmupStatus({
        queueSize: this.queue.size(),
      });

      // Start scheduler execution
      this.scheduler.start();
    } catch (err) {
      logger.error('Error during warmup discovery', { error: String(err) });
    } finally {
      this.isDiscovering = false;
    }
  }

  public pauseWarmup(reason = 'User paused'): void {
    this.scheduler.pause(reason);
  }

  public resumeWarmup(): void {
    this.scheduler.resume();
  }

  public cancelWarmup(): void {
    this.scheduler.cancel();
    stateStore.updateWarmupStatus({
      status: 'idle',
      queueSize: 0,
      currentFile: undefined,
      pauseReason: undefined,
    });
    StatusBarController.getInstance().setState({ kind: 'ready' });
  }

  private registerListeners(): void {
    // 1. Config updates (e.g. concurrency changed)
    this.register(
      this.configService.onDidChangeConfig((config) => {
        this.scheduler.setConcurrency(config.warmupConcurrency);
      })
    );

    // 2. Active editor change: immediately discover and enqueue P0 task
    this.register(
      vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (!editor || editor.document.uri.scheme !== 'file') {
          return;
        }

        const config = this.configService.getConfig();
        if (!config.warmupEnabled) {
          return;
        }

        const activeTasks = await this.activeStrategy.discover();
        for (const task of activeTasks) {
          this.scheduler.enqueueAndDrain(task);
        }

        const predictiveTasks = await this.predictiveStrategy.discover();
        for (const task of predictiveTasks) {
          this.scheduler.enqueueAndDrain(task);
        }
      })
    );
  }

  private handleSchedulerStatusChange(status: SchedulerStatus, reason?: string): void {
    const elapsed = this.startTime > 0 ? Date.now() - this.startTime : 0;

    stateStore.updateWarmupStatus({
      status,
      pauseReason: reason,
      queueSize: this.queue.size(),
      completedTasks: this.scheduler.getCompletedCount(),
      concurrency: this.scheduler.getConcurrency(),
      elapsedTimeMs: elapsed,
    });

    const statusBar = StatusBarController.getInstance();
    if (status === 'running') {
      const total = this.queue.size() + this.scheduler.getCompletedCount();
      const pct = total > 0 ? Math.round((this.scheduler.getCompletedCount() / total) * 100) : 0;
      statusBar.setState({ kind: 'warmup', progressPercent: pct });
    } else if (status === 'paused') {
      statusBar.setState({ kind: 'paused', reason: reason ?? 'Warmup paused' });
    } else if (status === 'completed' || status === 'idle') {
      statusBar.setState({ kind: 'ready' });
    }
  }

  private handleSchedulerProgress(completed: number, total: number, currentUri?: vscode.Uri): void {
    const elapsed = this.startTime > 0 ? Date.now() - this.startTime : 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    stateStore.updateWarmupStatus({
      completedTasks: completed,
      queueSize: this.queue.size(),
      currentFile: currentUri ? vscode.workspace.asRelativePath(currentUri) : undefined,
      elapsedTimeMs: elapsed,
    });

    if (this.scheduler.getStatus() === 'running') {
      StatusBarController.getInstance().setState({ kind: 'warmup', progressPercent: pct });
    }
  }

  public override dispose(): void {
    this.cancelWarmup();
    super.dispose();
    WarmupEngine.instance = null;
  }
}
