import { PerformanceFinding } from '../model/Finding';
import { ScanResult } from '../../core/workspace/WorkspaceScanner';
import { EffectiveExcludeSettings } from '../../core/workspace/excludes/ExcludeSettingsReader';

export interface DiagnosticThresholds {
  highFileCount?: number;
  excessiveGeneratedRatio?: number;
  largeFileSizeBytes?: number;
  excessiveGeneratedFilesCount?: number;
}

export interface DiagnosticContext {
  scanResult: ScanResult;
  excludes: EffectiveExcludeSettings;
  generatedSourceCount?: number;
  thresholds?: DiagnosticThresholds;
}

export interface DiagnosticRule {
  readonly id: string;
  readonly name: string;
  evaluate(context: DiagnosticContext): PerformanceFinding[];
}
