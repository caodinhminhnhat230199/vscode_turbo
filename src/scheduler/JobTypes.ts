import * as vscode from 'vscode';

export enum JobPriority {
  P0_INTERACTIVE_SEARCH = 0,
  P1_NAVIGATION = 1,
  P2_INCREMENTAL_INDEX = 2,
  P3_USER_TRIGGERED_DIAGNOSTIC = 3,
  P4_WARMUP = 4,
  P5_BACKGROUND_INDEX = 5,
  P6_MAINTENANCE = 6,
}

export type JobType =
  | 'search_file'
  | 'search_symbol'
  | 'search_text'
  | 'navigation_definition'
  | 'navigation_references'
  | 'index_incremental'
  | 'index_batch'
  | 'diagnostic_run'
  | 'warmup_task'
  | 'maintenance';

export interface ScheduledJob<T = unknown> {
  id: string;
  groupId?: string;
  priority: JobPriority;
  type: JobType;
  cancellable?: boolean;
  estimatedCost?: 'low' | 'medium' | 'high';
  execute: (token?: vscode.CancellationToken) => Promise<T>;
}

export interface JobExecutionStats {
  totalScheduled: number;
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  queueLength: number;
  activeWorkers: number;
  pausedPriorities: JobPriority[];
}
