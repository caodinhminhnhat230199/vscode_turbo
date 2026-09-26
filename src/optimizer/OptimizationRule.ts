import { PerformanceFinding } from '../diagnostics/model/Finding';
import { ScanResult } from '../core/workspace/WorkspaceScanner';
import { EffectiveExcludeSettings } from '../core/workspace/excludes/ExcludeSettingsReader';
import { BenchmarkResult } from '../benchmark/benchmarkTypes';

export interface OptimizationContext {
  scanResult?: ScanResult;
  excludes?: EffectiveExcludeSettings;
  benchmarkResult?: BenchmarkResult;
  totalWorkspaceFiles?: number;
  reindexStats?: {
    reindexCount?: number;
    invalidationsPerMinute?: number;
    generatedFilesWatched?: string[];
  };
  installedExtensions?: ReadonlyArray<{
    id: string;
    isActive: boolean;
    packageJSON?: Record<string, unknown>;
  }>;
  [key: string]: unknown;
}

export interface OptimizationRule {
  id: string;
  name?: string;
  evaluate(
    context: OptimizationContext
  ):
    | Promise<PerformanceFinding | null | PerformanceFinding[]>
    | PerformanceFinding
    | null
    | PerformanceFinding[];
}
