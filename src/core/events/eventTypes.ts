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

export interface CodePulseEvents {
  workspaceChanged: { summary: WorkspaceSummary };
  workspaceFoldersChanged: { folders: WorkspaceFolderInfo[]; activeFolder?: WorkspaceFolderInfo };
  diagnosticsUpdated: { findings: PerformanceFinding[] };
  benchmarkCompleted: { result: BenchmarkResult };
  indexUpdated: { status: IndexStatus };
  indexProgress: { current: number; total: number; file: string };
  warmupUpdated: { status: WarmupStatus };
  configurationChanged: { key: string; value: unknown };
}
