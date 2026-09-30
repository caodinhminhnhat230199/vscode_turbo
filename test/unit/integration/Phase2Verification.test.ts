import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { executeBenchmark, registerCommands } from '../../../src/vscode/commands';
import { stateStore } from '../../../src/core/state/StateStore';
import { WebviewMessageRouter } from '../../../src/webview/WebviewMessageRouter';
import { applyRecommendationService } from '../../../src/optimizer/ApplyRecommendation';
import { benchmarkRunner } from '../../../src/benchmark/BenchmarkRunner';

describe('P2.11 — Phase 2 End-to-End Verification', () => {
  beforeEach(() => {
    (vscode.workspace as any)._clearConfigs();
    vi.restoreAllMocks();
  });

  it('runs complete benchmark execution flow and records results in stateStore', async () => {
    const mockUri = vscode.Uri.file('/workspace/src/app.ts');
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeDefinitionProvider') {
        return [{ uri: mockUri, range: {} } as any];
      }
      return undefined;
    });

    // Mock findFiles fallback
    vi.spyOn(vscode.workspace, 'findFiles' as any).mockImplementation(async () => [mockUri]);

    const result = await executeBenchmark('definition', 3);

    expect(result).not.toBeNull();
    expect(result?.operation).toBe('definition');
    expect(result?.sampleCount).toBe(3);
    expect(result?.p50Ms).toBeGreaterThanOrEqual(0);

    const storeState = stateStore.getState();
    expect(storeState.benchmarks.length).toBeGreaterThan(0);
    expect(storeState.benchmarks[0].operation).toBe('definition');
    expect(storeState.benchmarks[0].p50Ms).toBe(result?.p50Ms);
  });

  it('evaluates language rules and merges findings into stateStore when slow latency is detected', async () => {
    const mockUri = vscode.Uri.file('/workspace/src/app.ts');
    vi.spyOn(vscode.workspace, 'findFiles' as any).mockImplementation(async () => [mockUri]);

    // Simulate artificially slow executeDefinitionProvider (over 800ms)
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeDefinitionProvider') {
        await new Promise((resolve) => setTimeout(resolve, 850));
        return [{ uri: mockUri, range: {} } as any];
      }
      return undefined;
    });

    const result = await executeBenchmark('definition', 2);
    expect(result?.category).toBe('LANGUAGE_PERSISTENT_SLOW');

    const findings = stateStore.getState().findings;
    const langFinding = findings.find((f) => f.sourceMetadata?.ruleId === 'LANGUAGE_002');
    expect(langFinding).toBeDefined();
    expect(langFinding?.recommendation).toBeDefined();

    // Verify recommendation can be applied cleanly
    if (langFinding?.recommendation) {
      await applyRecommendationService.applyRecommendation(langFinding.recommendation, {
        skipPrompt: true,
      });
      const applied = vscode.workspace.getConfiguration('vsturbo').get('navigation.mode');
      expect(applied).toBe('hybrid');
    }
  });

  it('routes RUN_BENCHMARK and CANCEL_BENCHMARK through WebviewMessageRouter', async () => {
    const execSpy = vi.spyOn(vscode.commands, 'executeCommand');

    await WebviewMessageRouter.handleMessage({
      type: 'RUN_BENCHMARK',
      payload: { operation: 'workspaceSymbols', iterations: 5 },
    });
    expect(execSpy).toHaveBeenCalledWith('vsturbo.runBenchmark', 'workspaceSymbols', 5);

    await WebviewMessageRouter.handleMessage({
      type: 'CANCEL_BENCHMARK',
      payload: { operation: 'workspaceSymbols' },
    });
    expect(execSpy).toHaveBeenCalledWith('vsturbo.cancelBenchmark', 'workspaceSymbols');
  });

  it('registers codePulse.cancelBenchmark and cancels active runner', async () => {
    const context = { subscriptions: [] } as any;
    registerCommands(context);

    const cancelSpy = vi.spyOn(benchmarkRunner, 'cancel');
    await vscode.commands.executeCommand('codePulse.cancelBenchmark', 'definition');
    expect(cancelSpy).toHaveBeenCalledWith('definition');
  });
});
