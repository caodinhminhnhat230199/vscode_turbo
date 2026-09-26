import { BenchmarkResult, PerformanceFinding } from '../models/diagnosticModels';
import { IndexStatus, WarmupStatus, WorkspaceSummary } from '../events/eventTypes';
import { eventBus } from '../events/EventBus';

export interface DashboardState {
  workspace: WorkspaceSummary;
  findings: PerformanceFinding[];
  benchmarks: BenchmarkResult[];
  indexStatus: IndexStatus;
  warmupStatus: WarmupStatus;
  lastUpdated: number;
}

export const INITIAL_DASHBOARD_STATE: DashboardState = {
  workspace: {
    folderCount: 0,
    totalFiles: 0,
    sourceFiles: 0,
    generatedFiles: 0,
    languages: {},
    frameworks: [],
  },
  findings: [],
  benchmarks: [],
  indexStatus: {
    status: 'idle',
    indexedFiles: 0,
    totalFiles: 0,
    symbolCount: 0,
    queueSize: 0,
    dbSizeBytes: 0,
    schemaVersion: 1,
  },
  warmupStatus: {
    status: 'idle',
    queueSize: 0,
    completedTasks: 0,
    concurrency: 2,
    elapsedTimeMs: 0,
  },
  lastUpdated: Date.now(),
};

export class StateStore {
  private static instance: StateStore | null = null;
  private state: DashboardState = { ...INITIAL_DASHBOARD_STATE };
  private listeners: Set<(state: DashboardState) => void> = new Set();

  public static getInstance(): StateStore {
    if (!StateStore.instance) {
      StateStore.instance = new StateStore();
    }
    return StateStore.instance;
  }

  public getState(): DashboardState {
    return { ...this.state };
  }

  public updateWorkspace(summary: WorkspaceSummary): void {
    this.state = {
      ...this.state,
      workspace: summary,
      lastUpdated: Date.now(),
    };
    this.notify();
    eventBus.emit('workspaceChanged', { summary });
  }

  public updateFindings(findings: PerformanceFinding[]): void {
    this.state = {
      ...this.state,
      findings,
      lastUpdated: Date.now(),
    };
    this.notify();
    eventBus.emit('diagnosticsUpdated', { findings });
  }

  public addBenchmarkResult(result: BenchmarkResult): void {
    this.state = {
      ...this.state,
      benchmarks: [result, ...this.state.benchmarks.slice(0, 49)], // keep last 50
      lastUpdated: Date.now(),
    };
    this.notify();
    eventBus.emit('benchmarkCompleted', { result });
  }

  public updateIndexStatus(status: Partial<IndexStatus>): void {
    this.state = {
      ...this.state,
      indexStatus: { ...this.state.indexStatus, ...status },
      lastUpdated: Date.now(),
    };
    this.notify();
    eventBus.emit('indexUpdated', { status: this.state.indexStatus });
  }

  public updateWarmupStatus(status: Partial<WarmupStatus>): void {
    this.state = {
      ...this.state,
      warmupStatus: { ...this.state.warmupStatus, ...status },
      lastUpdated: Date.now(),
    };
    this.notify();
    eventBus.emit('warmupUpdated', { status: this.state.warmupStatus });
  }

  public subscribe(listener: (state: DashboardState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error notifying StateStore listener:', err);
      }
    }
  }

  public reset(): void {
    this.state = { ...INITIAL_DASHBOARD_STATE, lastUpdated: Date.now() };
    this.notify();
  }
}

export const stateStore = StateStore.getInstance();
