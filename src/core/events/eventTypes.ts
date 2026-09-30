import { BenchmarkResult, PerformanceFinding } from '../models/diagnosticModels';
import { WorkspaceFolderInfo } from '../workspace/WorkspaceState';

export interface WorkspaceSummary {
  folderCount: number;
  totalFiles: number;
  sourceFiles: number;
  generatedFiles: number;
  languages: Record<string, number>;
  primaryLanguage?: string;
  frameworks: string[];
}

export interface IndexStatus {
  status: 'idle' | 'indexing' | 'paused' | 'error';
  indexedFiles: number;
  totalFiles: number;
  symbolCount: number;
  queueSize: number;
  dbSizeBytes: number;
  schemaVersion: number;
  lastIndexDurationMs?: number;
}

export interface WarmupStatus {
  status: 'idle' | 'running' | 'paused' | 'completed';
  queueSize: number;
  completedTasks: number;
  currentFile?: string;
  pauseReason?: string;
  concurrency: number;
  elapsedTimeMs: number;
}

export interface FileEventData {
  uri: string;
  fsPath: string;
  languageId?: string;
}

export interface FileRenamedData {
  oldFsPath: string;
  newFsPath: string;
}

export interface BulkChangeData {
  fileCount: number;
  type: 'git_checkout' | 'package_install' | 'bulk_edit' | 'unknown';
}

export interface SearchSessionEventData {
  sessionId: string;
  query: string;
  mode: string;
  durationMs?: number;
  resultCount?: number;
}

export interface JobScheduledData {
  jobId: string;
  priority: number;
  type: string;
}

export interface JobCompletedData {
  jobId: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface VsTurboEvents {
  workspaceChanged: { summary: WorkspaceSummary };
  workspaceFoldersChanged: { folders: WorkspaceFolderInfo[]; activeFolder?: WorkspaceFolderInfo };
  diagnosticsUpdated: { findings: PerformanceFinding[] };
  benchmarkCompleted: { result: BenchmarkResult };
  indexUpdated: { status: IndexStatus };
  indexProgress: { current: number; total: number; file: string };
  warmupUpdated: { status: WarmupStatus };
  configurationChanged: { key: string; value: unknown };
  fileCreated: FileEventData;
  fileChanged: FileEventData;
  fileDeleted: { uri: string; fsPath: string };
  fileRenamed: FileRenamedData;
  bulkChangeDetected: BulkChangeData;
  searchSessionStarted: SearchSessionEventData;
  searchSessionEnded: SearchSessionEventData;
  jobScheduled: JobScheduledData;
  jobCompleted: JobCompletedData;
}

export type CodePulseEvents = VsTurboEvents;
