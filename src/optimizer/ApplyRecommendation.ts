import * as vscode from 'vscode';
import { Recommendation, SettingChange } from '../diagnostics/model/Recommendation';
import { SettingsDiff } from './SettingsDiff';
import { logger } from '../core/logging/Logger';
import { BenchmarkResult, BenchmarkOperation } from '../benchmark/benchmarkTypes';
import { BenchmarkDeltaService, BenchmarkComparison } from './BenchmarkDeltaService';

export interface AppliedSessionRecord {
  id: string;
  recommendationId: string;
  title: string;
  timestamp: number;
  changes: SettingChange[];
  preBenchmark?: BenchmarkResult;
  postBenchmark?: BenchmarkResult;
  comparison?: BenchmarkComparison;
}

export interface ApplyRecommendationOptions {
  skipPrompt?: boolean;
  preBenchmark?: BenchmarkResult;
  runBenchmarkFn?: (op: BenchmarkOperation) => Promise<BenchmarkResult | null>;
  benchmarkOperation?: BenchmarkOperation;
}

export class ApplyRecommendationService {
  private static instance: ApplyRecommendationService | null = null;
  private appliedHistory: AppliedSessionRecord[] = [];

  public static getInstance(): ApplyRecommendationService {
    if (!ApplyRecommendationService.instance) {
      ApplyRecommendationService.instance = new ApplyRecommendationService();
    }
    return ApplyRecommendationService.instance;
  }

  public getHistory(): readonly AppliedSessionRecord[] {
    return [...this.appliedHistory];
  }

  public clearHistory(): void {
    this.appliedHistory = [];
  }

  public async applyRecommendation(
    recommendation: Recommendation,
    options: ApplyRecommendationOptions = {}
  ): Promise<{
    success: boolean;
    message: string;
    appliedRecord?: AppliedSessionRecord;
    comparison?: BenchmarkComparison;
  }> {
    if (!recommendation.changes || recommendation.changes.length === 0) {
      return {
        success: false,
        message: 'Recommendation contains no automated configuration changes.',
      };
    }

    // 0. Capture pre-change benchmark if requested
    let preBenchmark = options.preBenchmark;
    if (!preBenchmark && options.runBenchmarkFn && options.benchmarkOperation) {
      try {
        preBenchmark = (await options.runBenchmarkFn(options.benchmarkOperation)) ?? undefined;
      } catch (err) {
        logger.warn('Failed to capture pre-benchmark', { error: String(err) });
      }
    }

    // 1. Generate diff for preview
    const diffLines: string[] = [];
    for (const change of recommendation.changes) {
      const diff = SettingsDiff.computeDiff(change.section, change.oldValue, change.newValue);
      diffLines.push(diff.humanReadable);
    }
    const fullDiffText = diffLines.join('\n\n');

    // 2. User confirmation (unless skipPrompt is explicitly set, e.g. for testing)
    if (!options.skipPrompt) {
      const confirmItem = 'Apply Changes';
      const cancelItem = 'Cancel';
      const selection = await vscode.window.showInformationMessage(
        `CodePulse: Apply optimization "${recommendation.title}"?\n\n${fullDiffText}`,
        { modal: true },
        confirmItem,
        cancelItem
      );

      if (selection !== confirmItem) {
        return {
          success: false,
          message: 'Apply recommendation was cancelled by user.',
        };
      }
    }

    // 3. Apply changes via VS Code configuration API
    const appliedChanges: SettingChange[] = [];
    try {
      for (const change of recommendation.changes) {
        const { baseSection, property } = this.splitSection(change.section);
        const config = vscode.workspace.getConfiguration(baseSection);

        const target =
          change.target === 'global'
            ? vscode.ConfigurationTarget.Global
            : vscode.ConfigurationTarget.Workspace;

        await config.update(property, change.newValue, target);
        appliedChanges.push(change);
        logger.info(`Updated setting ${change.section}`, { newValue: change.newValue });
      }

      // 4. Optionally rerun benchmark post-apply to measure delta
      let postBenchmark: BenchmarkResult | undefined;
      let comparison: BenchmarkComparison | undefined;

      if (options.runBenchmarkFn && (preBenchmark || options.benchmarkOperation)) {
        try {
          const op =
            options.benchmarkOperation ||
            (preBenchmark?.operation as BenchmarkOperation) ||
            'definition';
          postBenchmark = (await options.runBenchmarkFn(op)) ?? undefined;
          if (preBenchmark && postBenchmark) {
            comparison = BenchmarkDeltaService.compare(preBenchmark, postBenchmark);
            if (comparison.isRegression) {
              logger.warn(`Optimization regression detected after applying ${recommendation.id}`, {
                comparison,
              });
            } else {
              logger.info(`Optimization improvement measured after applying ${recommendation.id}`, {
                comparison,
              });
            }
          }
        } catch (benchErr) {
          logger.warn('Failed to capture post-benchmark', { error: String(benchErr) });
        }
      }

      // 5. Record for undo/rollback in current session
      const record: AppliedSessionRecord = {
        id: `APPLY_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        recommendationId: recommendation.id,
        title: recommendation.title,
        timestamp: Date.now(),
        changes: appliedChanges,
        preBenchmark,
        postBenchmark,
        comparison,
      };
      this.appliedHistory.unshift(record);

      // 6. Trigger diagnostics refresh if available
      try {
        await vscode.commands.executeCommand('codePulse.analyzeWorkspace');
      } catch {
        // analyze command may not yet be triggered
      }

      let message = `Successfully applied: ${recommendation.title}`;
      if (comparison) {
        message += ` — ${comparison.honestyAssessment}`;
      }

      return {
        success: true,
        message,
        appliedRecord: record,
        comparison,
      };
    } catch (err) {
      const errorMessage = `Failed to apply recommendation "${recommendation.title}": ${String(err)}`;
      logger.error(errorMessage, { error: String(err) });
      vscode.window.showErrorMessage(errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  public async undo(
    recordId?: string,
    options: { skipPrompt?: boolean } = {}
  ): Promise<{ success: boolean; message: string }> {
    if (this.appliedHistory.length === 0) {
      return { success: false, message: 'No recommendations in history to undo.' };
    }

    const recordIndex = recordId ? this.appliedHistory.findIndex((r) => r.id === recordId) : 0;

    if (recordIndex === -1) {
      return { success: false, message: `Apply record not found: ${recordId}` };
    }

    const record = this.appliedHistory[recordIndex];

    if (!options.skipPrompt) {
      const confirmItem = 'Revert Settings';
      const selection = await vscode.window.showWarningMessage(
        `CodePulse: Undo "${record.title}" and restore previous settings?`,
        { modal: true },
        confirmItem,
        'Cancel'
      );
      if (selection !== confirmItem) {
        return { success: false, message: 'Undo cancelled by user.' };
      }
    }

    try {
      for (const change of record.changes) {
        const { baseSection, property } = this.splitSection(change.section);
        const config = vscode.workspace.getConfiguration(baseSection);
        const target =
          change.target === 'global'
            ? vscode.ConfigurationTarget.Global
            : vscode.ConfigurationTarget.Workspace;

        await config.update(property, change.oldValue, target);
        logger.info(`Reverted setting ${change.section}`, { restoredValue: change.oldValue });
      }

      this.appliedHistory.splice(recordIndex, 1);

      try {
        await vscode.commands.executeCommand('codePulse.analyzeWorkspace');
      } catch {
        // ignore
      }

      return {
        success: true,
        message: `Reverted "${record.title}" successfully.`,
      };
    } catch (err) {
      const errorMessage = `Failed to undo "${record.title}": ${String(err)}`;
      logger.error(errorMessage, { error: String(err) });
      vscode.window.showErrorMessage(errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  private splitSection(section: string): { baseSection: string; property: string } {
    const dotIndex = section.indexOf('.');
    if (dotIndex === -1) {
      return { baseSection: '', property: section };
    }
    return {
      baseSection: section.substring(0, dotIndex),
      property: section.substring(dotIndex + 1),
    };
  }
}

export const applyRecommendationService = ApplyRecommendationService.getInstance();
