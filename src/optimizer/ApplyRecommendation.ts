import * as vscode from 'vscode';
import { Recommendation, SettingChange } from '../diagnostics/model/Recommendation';
import { SettingsDiff } from './SettingsDiff';
import { logger } from '../core/logging/Logger';
import { BenchmarkResult, BenchmarkOperation } from '../benchmark/benchmarkTypes';
import { BenchmarkDeltaService, BenchmarkComparison } from './BenchmarkDeltaService';
import { stateStore } from '../core/state/StateStore';

export interface AppliedSettingChange extends SettingChange {
  resolvedTarget: vscode.ConfigurationTarget;
}

export interface AppliedSessionRecord {
  id: string;
  recommendationId: string;
  title: string;
  timestamp: number;
  changes: AppliedSettingChange[];
  preBenchmark?: BenchmarkResult;
  postBenchmark?: BenchmarkResult;
  comparison?: BenchmarkComparison;
}

export interface ApplyRecommendationOptions {
  skipPrompt?: boolean;
  skipRefresh?: boolean;
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
    const hasWorkspace =
      Array.isArray(vscode.workspace.workspaceFolders) &&
      vscode.workspace.workspaceFolders.length > 0;

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
        `VS Turbo: Apply optimization "${recommendation.title}"?\n\n${fullDiffText}${
          hasWorkspace ? '' : '\n\nNo workspace is open, so this will update global user settings.'
        }`,
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
    const appliedChanges: AppliedSettingChange[] = [];
    try {
      for (const change of recommendation.changes) {
        const { baseSection, property } = this.splitSection(change.section);
        const config = vscode.workspace.getConfiguration(baseSection);

        const target = this.resolveTarget(change.target, hasWorkspace);
        const effectiveCurrentValue = config.get<unknown>(property);
        const targetValueBeforeApply = this.getTargetValue(config, property, target);
        const finalValue = this.mergeSettingValue(
          effectiveCurrentValue,
          change.oldValue,
          change.newValue
        );

        await config.update(property, finalValue, target);
        appliedChanges.push({
          ...change,
          oldValue: targetValueBeforeApply,
          newValue: finalValue,
          target:
            target === vscode.ConfigurationTarget.Global
              ? 'global'
              : (change.target ?? 'workspace'),
          resolvedTarget: target,
        });
        logger.info(`Updated setting ${change.section}`, { newValue: finalValue });
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

      // Immediately remove applied finding from stateStore so UI updates instantly
      const currentFindings = stateStore.getState().findings;
      const remainingFindings = currentFindings.filter(
        (f) => f.recommendation?.id !== recommendation.id
      );
      if (remainingFindings.length !== currentFindings.length) {
        stateStore.updateFindings(remainingFindings);
      }

      // 6. Trigger diagnostics refresh if available
      if (!options.skipRefresh) {
        try {
          await vscode.commands.executeCommand('vsturbo.analyzeWorkspace');
        } catch {
          // analyze command may not yet be triggered
        }
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

  public async applyAll(
    recommendations: Recommendation[],
    options: {
      skipPrompt?: boolean;
      skipRefresh?: boolean;
      runBenchmarkFn?: (operation: BenchmarkOperation) => Promise<BenchmarkResult | null>;
    } = {}
  ): Promise<{ success: boolean; appliedCount: number; message: string }> {
    const validRecs = recommendations.filter(
      (r) => r && Array.isArray(r.changes) && r.changes.length > 0
    );

    if (validRecs.length === 0) {
      return {
        success: false,
        appliedCount: 0,
        message: 'No recommendations with automated configuration changes found.',
      };
    }

    if (!options.skipPrompt) {
      const confirmItem = 'Approve All';
      const cancelItem = 'Cancel';
      const hasWorkspace =
        Array.isArray(vscode.workspace.workspaceFolders) &&
        vscode.workspace.workspaceFolders.length > 0;
      const scopeDescription = hasWorkspace
        ? 'this workspace'
        : 'global user settings because no workspace is open';
      const selection = (await vscode.window.showInformationMessage(
        `VS Turbo: Approve and apply all ${validRecs.length} recommendations to ${scopeDescription}?`,
        { modal: true },
        confirmItem,
        cancelItem
      )) as string | undefined;

      const isConfirmed =
        selection === confirmItem ||
        selection === 'Apply All' ||
        selection === 'OK' ||
        selection === 'Yes';

      if (!isConfirmed) {
        return {
          success: false,
          appliedCount: 0,
          message: 'Bulk apply was cancelled by user.',
        };
      }
    }

    let appliedCount = 0;
    const appliedRecIds = new Set<string>();
    for (const rec of validRecs) {
      const res = await this.applyRecommendation(rec, {
        skipPrompt: true,
        skipRefresh: true,
        runBenchmarkFn: options.runBenchmarkFn,
      });
      if (res.success) {
        appliedCount++;
        appliedRecIds.add(rec.id);
      }
    }

    // Immediately remove all successfully applied findings from stateStore
    const currentFindings = stateStore.getState().findings;
    const remainingFindings = currentFindings.filter(
      (f) => !f.recommendation || !appliedRecIds.has(f.recommendation.id)
    );
    if (remainingFindings.length !== currentFindings.length) {
      stateStore.updateFindings(remainingFindings);
    }

    if (!options.skipRefresh) {
      try {
        await vscode.commands.executeCommand('vsturbo.analyzeWorkspace');
      } catch {
        // ignore
      }
    }

    const message = `Successfully applied ${appliedCount} of ${validRecs.length} recommendations.`;
    return {
      success: appliedCount > 0,
      appliedCount,
      message,
    };
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
        `VS Turbo: Undo "${record.title}" and restore previous settings?`,
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
        await config.update(property, change.oldValue, change.resolvedTarget);
        logger.info(`Reverted setting ${change.section}`, { restoredValue: change.oldValue });
      }

      this.appliedHistory.splice(recordIndex, 1);

      try {
        await vscode.commands.executeCommand('vsturbo.analyzeWorkspace');
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

  private resolveTarget(
    requestedTarget: SettingChange['target'],
    hasWorkspace: boolean
  ): vscode.ConfigurationTarget {
    if (requestedTarget === 'global' || !hasWorkspace) {
      return vscode.ConfigurationTarget.Global;
    }
    return vscode.ConfigurationTarget.Workspace;
  }

  private getTargetValue(
    config: vscode.WorkspaceConfiguration,
    property: string,
    target: vscode.ConfigurationTarget
  ): unknown {
    const inspected = config.inspect<unknown>(property);
    if (inspected) {
      if (target === vscode.ConfigurationTarget.Global) {
        return inspected.globalValue;
      }
      if (target === vscode.ConfigurationTarget.WorkspaceFolder) {
        return inspected.workspaceFolderValue;
      }
      return inspected.workspaceValue;
    }
    return config.get<unknown>(property);
  }

  private mergeSettingValue(current: unknown, before: unknown, after: unknown): unknown {
    if (!this.isDictionary(after)) {
      return after;
    }

    const currentDictionary = this.isDictionary(current) ? current : {};
    const beforeDictionary = this.isDictionary(before) ? before : {};
    return this.applyDictionaryPatch(currentDictionary, beforeDictionary, after);
  }

  private applyDictionaryPatch(
    current: Record<string, unknown>,
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...current };

    for (const key of Object.keys(before)) {
      if (!(key in after)) {
        delete result[key];
      }
    }

    for (const [key, value] of Object.entries(after)) {
      if (this.isDictionary(value)) {
        const currentValue = this.isDictionary(result[key]) ? result[key] : {};
        const beforeValue = this.isDictionary(before[key]) ? before[key] : {};
        result[key] = this.applyDictionaryPatch(currentValue, beforeValue, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private isDictionary(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

export const applyRecommendationService = ApplyRecommendationService.getInstance();
