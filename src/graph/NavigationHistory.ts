import { configService } from '../vscode/config';
import { dependencyGraph } from './DependencyGraph';

export interface NavigationHistoryEntry {
  fromFile: string;
  toFile: string;
  symbolName?: string;
  timestamp: number;
}

export class NavigationHistory {
  private static instance: NavigationHistory | null = null;
  private history: NavigationHistoryEntry[] = [];
  private readonly maxEntries = 100;

  public static getInstance(): NavigationHistory {
    if (!NavigationHistory.instance) {
      NavigationHistory.instance = new NavigationHistory();
    }
    return NavigationHistory.instance;
  }

  public record(fromFile: string, toFile: string, symbolName?: string): void {
    const config = configService.getConfig();
    if (!config.navigationTrackHistory) {
      return;
    }

    const normFrom = fromFile.replace(/\\/g, '/');
    const normTo = toFile.replace(/\\/g, '/');

    if (!normFrom || !normTo || normFrom === normTo) {
      return;
    }

    const entry: NavigationHistoryEntry = {
      fromFile: normFrom,
      toFile: normTo,
      symbolName,
      timestamp: Date.now(),
    };

    this.history.unshift(entry);
    if (this.history.length > this.maxEntries) {
      this.history.length = this.maxEntries;
    }

    // Add navigation edge to graph
    dependencyGraph.recordNavigation(normFrom, normTo, 1);
  }

  public getHistory(): readonly NavigationHistoryEntry[] {
    return this.history;
  }

  public getRecentTargets(fromFile?: string, limit = 10): string[] {
    const normFrom = fromFile ? fromFile.replace(/\\/g, '/') : undefined;
    const seen = new Set<string>();
    const targets: string[] = [];

    for (const entry of this.history) {
      if (normFrom && entry.fromFile !== normFrom) {
        continue;
      }
      if (!seen.has(entry.toFile)) {
        seen.add(entry.toFile);
        targets.push(entry.toFile);
        if (targets.length >= limit) {
          break;
        }
      }
    }

    return targets;
  }

  public getNavigationFrequency(fromFile: string, toFile: string): number {
    const normFrom = fromFile.replace(/\\/g, '/');
    const normTo = toFile.replace(/\\/g, '/');

    return this.history.filter((e) => e.fromFile === normFrom && e.toFile === normTo).length;
  }

  public clear(): void {
    this.history = [];
  }
}

export const navigationHistory = NavigationHistory.getInstance();
