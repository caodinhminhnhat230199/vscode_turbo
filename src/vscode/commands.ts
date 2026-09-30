import * as vscode from 'vscode';
import { logger } from '../core/logging/Logger';
import { statusBar } from './statusBar';
import { stateStore } from '../core/state/StateStore';
import { workspaceScanner } from '../core/workspace/WorkspaceScanner';
import { compositeProjectDetector } from '../core/workspace/detection/CompositeProjectDetector';
import { excludeSettingsReader } from '../core/workspace/excludes/ExcludeSettingsReader';
import { diagnosticEngine } from '../diagnostics/DiagnosticEngine';
import { applyRecommendationService } from '../optimizer/ApplyRecommendation';
import { classifyFile } from '../core/workspace/classification/FileClassifier';
import { PerformanceFinding } from '../diagnostics/model/Finding';
import { Recommendation } from '../diagnostics/model/Recommendation';
import { DetectedProject } from '../core/workspace/detection/ProjectDetector';
import { BenchmarkOperation, BenchmarkResult } from '../benchmark/benchmarkTypes';
import { benchmarkRunner } from '../benchmark/BenchmarkRunner';
import { DefinitionBenchmark } from '../benchmark/operations/DefinitionBenchmark';
import { ReferencesBenchmark } from '../benchmark/operations/ReferencesBenchmark';
import { WorkspaceSymbolBenchmark } from '../benchmark/operations/WorkspaceSymbolBenchmark';
import { FileSearchBenchmark } from '../benchmark/operations/FileSearchBenchmark';
import { ColdWarmClassifier } from '../benchmark/ColdWarmClassifier';
import { LanguageRulesEvaluator } from '../diagnostics/rules/languageRules';
import { indexEngine } from '../index/engine/IndexEngine';
import { WarmupEngine } from '../warmup/WarmupEngine';
import { SearchQuickPick } from '../search/ui/SearchQuickPick';
import { SearchPanel } from '../search/ui/SearchPanel';
import { definitionEngine } from '../navigation/DefinitionEngine';
import { referenceEngine } from '../navigation/ReferenceEngine';
import { ReferencesQuickPick } from '../navigation/ui/ReferencesQuickPick';
import { CursorSymbolResolver } from '../navigation/CursorSymbolResolver';
import { configService } from './config';

export async function runWorkspaceAnalysis(): Promise<PerformanceFinding[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    logger.info('No workspace folders to analyze');
    return [];
  }

  statusBar.setState({ kind: 'scanning' });
  const allFindings: PerformanceFinding[] = [];
  let totalFiles = 0;
  let sourceFiles = 0;
  let generatedFiles = 0;
  const detectedProjects: DetectedProject[] = [];

  for (const folder of folders) {
    const rootPath = folder.uri.fsPath;
    const projects = await compositeProjectDetector.detectFolder(rootPath);
    detectedProjects.push(...projects);

    const scanResult = await workspaceScanner.scan(rootPath);
    totalFiles += scanResult.totalFiles;

    for (const file of scanResult.largestFiles) {
      const cls = classifyFile(file.path);
      if (cls.source) {
        sourceFiles++;
      }
      if (cls.generated) {
        generatedFiles++;
      }
    }

    const excludes = excludeSettingsReader.readEffectiveExcludes(folder.uri);
    const findings = diagnosticEngine.analyze({
      scanResult,
      excludes,
      generatedSourceCount: generatedFiles,
    });
    allFindings.push(...findings);
  }

  const summary = compositeProjectDetector.summarize(detectedProjects);
  stateStore.updateWorkspace({
    folderCount: folders.length,
    totalFiles,
    sourceFiles: Math.max(sourceFiles, Math.round(totalFiles * 0.7)),
    generatedFiles,
    languages: summary.languages,
    primaryLanguage: summary.primaryLanguage,
    frameworks: summary.frameworks,
  });

  stateStore.updateFindings(allFindings);
  statusBar.setState({ kind: 'ready' });
  logger.info(`Workspace analysis complete. Found ${allFindings.length} findings.`);
  return allFindings;
}

export async function executeBenchmark(
  operation: BenchmarkOperation = 'definition',
  iterations?: number
): Promise<BenchmarkResult | null> {
  const op = operation || 'definition';
  logger.info(`Starting benchmark for operation: ${op}`);
  statusBar.setState({ kind: 'benchmarking', operation: op });
  vscode.window.showInformationMessage(`VS Turbo: Running benchmark (${op})...`);

  try {
    let result: BenchmarkResult;
    const opts = { iterations };
    switch (op) {
      case 'definition':
        result = await DefinitionBenchmark.run(undefined, opts);
        break;
      case 'references':
        result = await ReferencesBenchmark.run(undefined, opts);
        break;
      case 'workspaceSymbols':
        result = await WorkspaceSymbolBenchmark.run(undefined, opts);
        break;
      case 'fileSearch':
        result = await FileSearchBenchmark.run('**/*', opts);
        break;
      default:
        throw new Error(`Unsupported benchmark operation: ${op}`);
    }

    const category = ColdWarmClassifier.classify(result);
    result.category = category;
    stateStore.addBenchmarkResult(result);

    const findings = LanguageRulesEvaluator.evaluateBenchmark(result);
    if (findings.length > 0) {
      const existing = stateStore.getState().findings;
      const merged = [...existing];
      for (const f of findings) {
        const idx = merged.findIndex((m) => m.id === f.id);
        if (idx >= 0) {
          merged[idx] = f;
        } else {
          merged.push(f);
        }
      }
      stateStore.updateFindings(merged);
    }

    statusBar.setState({ kind: 'ready' });
    vscode.window.showInformationMessage(
      `VS Turbo: Benchmark (${op}) complete: P50=${result.p50Ms}ms, P95=${result.p95Ms}ms [${category}]`
    );
    return result;
  } catch (err: unknown) {
    statusBar.setState({ kind: 'ready' });
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Benchmark failed for ${op}`, err);
    vscode.window.showErrorMessage(`VS Turbo: Benchmark (${op}) failed: ${msg}`);
    return null;
  }
}

export function registerCommands(context: vscode.ExtensionContext): void {
  const commands: Array<{
    command: string;
    handler: (...args: unknown[]) => Promise<void> | void;
  }> = [
    {
      command: 'vsturbo.openDashboard',
      handler: async () => {
        logger.info('Opening VS Turbo Dashboard');
        await vscode.commands.executeCommand('vsturbo.dashboardView.focus');
      },
    },
    {
      command: 'vsturbo.analyzeWorkspace',
      handler: async () => {
        logger.info('Analyzing workspace');
        await runWorkspaceAnalysis();
      },
    },
    {
      command: 'vsturbo.applyRecommendation',
      handler: async (recIdOrFinding) => {
        let recommendation;
        if (typeof recIdOrFinding === 'string') {
          const finding = stateStore
            .getState()
            .findings.find((f) => f.recommendation?.id === recIdOrFinding);
          recommendation = finding?.recommendation;
        } else if (
          recIdOrFinding &&
          typeof recIdOrFinding === 'object' &&
          'recommendation' in recIdOrFinding
        ) {
          recommendation = (recIdOrFinding as PerformanceFinding).recommendation;
        }

        if (recommendation) {
          await applyRecommendationService.applyRecommendation(recommendation, {
            runBenchmarkFn: async (op) => executeBenchmark(op, 3),
          });
        } else {
          vscode.window.showWarningMessage('VS Turbo: Recommendation not found.');
        }
      },
    },
    {
      command: 'vsturbo.applyAllRecommendations',
      handler: async () => {
        const findings = stateStore.getState().findings || [];
        const recommendations: Recommendation[] = [];
        for (const f of findings) {
          if (
            f.recommendation &&
            Array.isArray(f.recommendation.changes) &&
            f.recommendation.changes.length > 0
          ) {
            recommendations.push(f.recommendation);
          }
        }

        if (recommendations.length === 0) {
          vscode.window.showInformationMessage('VS Turbo: No recommendations to approve.');
          return;
        }

        const result = await applyRecommendationService.applyAll(recommendations, {
          runBenchmarkFn: async (op) => executeBenchmark(op, 3),
        });

        if (result.success) {
          vscode.window.showInformationMessage(`VS Turbo: ${result.message}`);
        } else if (
          result.appliedCount === 0 &&
          result.message !== 'Bulk apply was cancelled by user.'
        ) {
          vscode.window.showWarningMessage(`VS Turbo: ${result.message}`);
        }
      },
    },
    {
      command: 'vsturbo.undoRecommendation',
      handler: async (recordId) => {
        await applyRecommendationService.undo(typeof recordId === 'string' ? recordId : undefined);
      },
    },
    {
      command: 'vsturbo.ignoreFinding',
      handler: async (findingId) => {
        if (typeof findingId === 'string') {
          const current = stateStore.getState().findings;
          const filtered = current.filter((f) => f.id !== findingId);
          stateStore.updateFindings(filtered);
          logger.info(`Ignored finding ${findingId}`);
          vscode.window.showInformationMessage('VS Turbo: Finding dismissed.');
        }
      },
    },
    {
      command: 'vsturbo.runBenchmark',
      handler: async (operation, iterations) => {
        const op = (typeof operation === 'string' ? operation : 'definition') as BenchmarkOperation;
        const it = typeof iterations === 'number' ? iterations : undefined;
        await executeBenchmark(op, it);
      },
    },
    {
      command: 'vsturbo.cancelBenchmark',
      handler: async (operation) => {
        const op = typeof operation === 'string' ? operation : undefined;
        benchmarkRunner.cancel(op);
        statusBar.setState({ kind: 'ready' });
        vscode.window.showInformationMessage('VS Turbo: Benchmark cancelled.');
      },
    },
    {
      command: 'vsturbo.warmupProject',
      handler: async () => {
        logger.info('Triggering project warmup');
        await WarmupEngine.getInstance().startWarmup();
      },
    },
    {
      command: 'vsturbo.pauseWarmup',
      handler: async () => {
        logger.info('Pausing project warmup');
        WarmupEngine.getInstance().pauseWarmup();
      },
    },
    {
      command: 'vsturbo.resumeWarmup',
      handler: async () => {
        logger.info('Resuming project warmup');
        WarmupEngine.getInstance().resumeWarmup();
      },
    },
    {
      command: 'vsturbo.cancelWarmup',
      handler: async () => {
        logger.info('Cancelling project warmup');
        WarmupEngine.getInstance().cancelWarmup();
      },
    },
    {
      command: 'vsturbo.rebuildIndex',
      handler: async () => {
        logger.info('Rebuilding index');
        vscode.window.showInformationMessage('VS Turbo: Rebuilding project index...');
        const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
        await indexEngine.rebuildIndex(roots);
      },
    },
    {
      command: 'vsturbo.clearIndex',
      handler: async () => {
        logger.info('Clearing index');
        await indexEngine.clearIndex();
        vscode.window.showInformationMessage('VS Turbo: Project index cleared.');
      },
    },
    {
      command: 'vsturbo.pauseIndexing',
      handler: async () => {
        logger.info('Pausing indexing');
        indexEngine.pause();
        vscode.window.showInformationMessage('VS Turbo: Indexing paused.');
      },
    },
    {
      command: 'vsturbo.resumeIndexing',
      handler: async () => {
        logger.info('Resuming indexing');
        indexEngine.resume();
        vscode.window.showInformationMessage('VS Turbo: Indexing resumed.');
      },
    },
    {
      command: 'vsturbo.quickSearch',
      handler: async () => {
        logger.info('Opening VS Turbo Quick Search');
        await SearchQuickPick.show();
      },
    },
    {
      command: 'vsturbo.fastDefinition',
      handler: async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        const config = configService.getConfig();
        const mode = config.navigationMode ?? 'native';
        logger.info(`Executing fast definition in mode: ${mode}`);
        const success = await definitionEngine.navigate(
          editor.document,
          editor.selection.active,
          mode
        );
        if (!success) {
          vscode.window.showInformationMessage('VS Turbo: No definition found.');
        }
      },
    },
    {
      command: 'vsturbo.fastReferences',
      handler: async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        const symbol = CursorSymbolResolver.resolve(editor.document, editor.selection.active);
        const name = symbol?.name ?? 'symbol';
        logger.info(`Finding fast references for: ${name}`);
        const refs = await referenceEngine.findReferences(
          editor.document,
          editor.selection.active,
          { symbol: symbol ?? undefined }
        );
        await ReferencesQuickPick.show(name, refs);
      },
    },
    {
      command: 'vsturbo.searchEverywhere',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, configService.getConfig().searchDefaultMode);
      },
    },
    {
      command: 'vsturbo.searchClass',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'class');
      },
    },
    {
      command: 'vsturbo.searchClasses',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'class');
      },
    },
    {
      command: 'vsturbo.searchFile',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'file');
      },
    },
    {
      command: 'vsturbo.searchFiles',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'file');
      },
    },
    {
      command: 'vsturbo.searchSymbol',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'symbol');
      },
    },
    {
      command: 'vsturbo.searchSymbols',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'symbol');
      },
    },
    {
      command: 'vsturbo.searchText',
      handler: async () => {
        await SearchPanel.show(context.extensionUri, 'text');
      },
    },
    {
      command: 'vsturbo.searchActions',
      handler: async () => {
        await vscode.commands.executeCommand('workbench.action.showCommands');
      },
    },
    {
      command: 'vsturbo.configureSearchShortcuts',
      handler: async () => {
        await vscode.commands.executeCommand(
          'workbench.action.openGlobalKeybindings',
          '@ext:kcevib.vsturbo'
        );
      },
    },
  ];

  for (const { command, handler } of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
    // Also register legacy codePulse.* alias so existing code/tests never break
    if (command.startsWith('vsturbo.')) {
      const legacy = command.replace(/^vsturbo\./, 'codePulse.');
      context.subscriptions.push(vscode.commands.registerCommand(legacy, handler));
    }
  }

  logger.debug(`Registered ${commands.length} VS Turbo commands`);
}
