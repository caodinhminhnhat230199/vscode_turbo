import * as vscode from 'vscode';
import * as fs from 'fs';
import { WarmupStrategy, WarmupDiscoveryContext } from './WarmupStrategy';
import { WarmupTask, createWarmupTask } from '../models/WarmupTask';
import { dependencyGraph } from '../../graph/DependencyGraph';
import { PriorityCalculator } from '../priority/PriorityCalculator';
import { navigationHistory } from '../../graph/NavigationHistory';

export interface PredictiveWarmupOptions {
  maxDepth?: number;
  limit?: number;
}

export class PredictiveWarmupStrategy implements WarmupStrategy {
  public readonly id = 'predictive';
  public readonly name = 'Predictive Dependency Warmup';

  private maxDepth: number;
  private limit: number;

  constructor(options?: PredictiveWarmupOptions) {
    this.maxDepth = options?.maxDepth ?? 2;
    this.limit = options?.limit ?? 10;
  }

  public async discover(context?: WarmupDiscoveryContext): Promise<WarmupTask[]> {
    if (context?.cancellationToken?.isCancellationRequested) {
      return [];
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return [];
    }

    const activePath = activeEditor.document.uri.fsPath.replace(/\\/g, '/');
    if (!activePath) {
      return [];
    }

    // 1. Query dependency graph around active file
    const neighbors = dependencyGraph.getNeighbors(activePath, {
      maxDepth: this.maxDepth,
      limit: this.limit,
    });

    const tasks: WarmupTask[] = [];
    const seen = new Set<string>();

    for (const neighbor of neighbors) {
      if (context?.cancellationToken?.isCancellationRequested) {
        break;
      }

      const neighborPath = neighbor.path.replace(/\\/g, '/');
      if (neighborPath === activePath || seen.has(neighborPath)) {
        continue;
      }
      seen.add(neighborPath);

      if (!fs.existsSync(neighborPath)) {
        continue;
      }

      // 2. Calculate priority score
      const navCount = navigationHistory.getNavigationFrequency(activePath, neighborPath);
      const score = PriorityCalculator.calculateScore({
        filePath: neighborPath,
        isDependencyNeighbor: true,
        dependencyDistance: neighbor.distance,
        navigationCount: navCount,
      });

      const queuePriority = PriorityCalculator.calculateQueuePriority(score);

      tasks.push(
        createWarmupTask({
          uri: vscode.Uri.file(neighborPath),
          priority: queuePriority,
          source: 'predictive',
          reason: `Predictive dependency of active file (${neighbor.edgeType}, distance ${neighbor.distance}, score ${score})`,
        })
      );
    }

    // Sort by priority (ascending: 0 is highest precedence)
    tasks.sort((a, b) => a.priority - b.priority);
    return tasks;
  }
}
