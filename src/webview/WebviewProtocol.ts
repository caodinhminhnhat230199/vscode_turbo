import { DashboardState } from '../core/state/StateStore';
import { VsTurboConfig } from '../vscode/config';
import { BenchmarkResult } from '../core/models/diagnosticModels';

export type ExtensionToWebviewMessage =
  | { type: 'STATE_UPDATE'; payload: DashboardState }
  | { type: 'CONFIG_UPDATE'; payload: VsTurboConfig }
  | { type: 'BENCHMARK_RESULT'; payload: BenchmarkResult }
  | { type: 'TOAST'; payload: { message: string; severity: 'info' | 'warn' | 'error' } };

export type WebviewToExtensionMessage =
  | { type: 'REQUEST_STATE' }
  | { type: 'REQUEST_CONFIG' }
  | { type: 'UPDATE_CONFIG'; payload: { key: string; value: unknown } }
  | { type: 'RUN_DIAGNOSTICS' }
  | { type: 'RUN_BENCHMARK'; payload?: { operation: string; iterations?: number } }
  | { type: 'CANCEL_BENCHMARK'; payload?: { operation?: string } }
  | { type: 'START_WARMUP' }
  | { type: 'PAUSE_WARMUP' }
  | { type: 'RESUME_WARMUP' }
  | { type: 'REBUILD_INDEX' }
  | { type: 'CLEAR_INDEX' }
  | { type: 'PAUSE_INDEX' }
  | { type: 'RESUME_INDEX' }
  | { type: 'APPLY_RECOMMENDATION'; payload: { recommendationId: string } }
  | { type: 'APPLY_ALL_RECOMMENDATIONS' }
  | { type: 'UNDO_RECOMMENDATION'; payload?: { recordId?: string } }
  | { type: 'IGNORE_FINDING'; payload: { findingId: string } }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'OPEN_KEYBINDINGS' };
