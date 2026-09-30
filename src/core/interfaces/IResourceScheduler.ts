import * as vscode from 'vscode';
import { JobPriority, ScheduledJob, JobExecutionStats } from '../../scheduler/JobTypes';

export interface IResourceScheduler extends vscode.Disposable {
  schedule<T>(job: ScheduledJob<T>): Promise<T>;
  cancel(jobId: string): boolean;
  cancelByGroup(groupId: string): number;
  pause(priority?: JobPriority): void;
  resume(priority?: JobPriority): void;
  isPaused(priority: JobPriority): boolean;
  getMetrics(): JobExecutionStats;
}
