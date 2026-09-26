import * as vscode from 'vscode';

export type StatusBarState =
  | { kind: 'ready' }
  | { kind: 'scanning' }
  | { kind: 'benchmarking'; operation?: string }
  | { kind: 'indexing'; progressPercent?: number }
  | { kind: 'warmup'; progressPercent?: number }
  | { kind: 'paused'; reason?: string }
  | { kind: 'issues'; count: number }
  | { kind: 'error'; message: string };

export class StatusBarController implements vscode.Disposable {
  private static instance: StatusBarController | null = null;
  private statusBarItem: vscode.StatusBarItem;
  private currentState: StatusBarState = { kind: 'ready' };

  public static getInstance(): StatusBarController {
    if (!StatusBarController.instance) {
      StatusBarController.instance = new StatusBarController();
    }
    return StatusBarController.instance;
  }

  private constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'codePulse.openDashboard';
    this.update();
    this.statusBarItem.show();
  }

  public setState(state: StatusBarState): void {
    this.currentState = state;
    this.update();
  }

  public getState(): StatusBarState {
    return this.currentState;
  }

  private update(): void {
    switch (this.currentState.kind) {
      case 'ready':
        this.statusBarItem.text = '$(pulse) CodePulse';
        this.statusBarItem.tooltip = 'CodePulse: Ready (Click to open dashboard)';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'scanning':
        this.statusBarItem.text = '$(sync~spin) CodePulse: Scanning';
        this.statusBarItem.tooltip = 'Scanning workspace structure...';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'benchmarking':
        this.statusBarItem.text = `$(watch) CodePulse: Benchmarking ${this.currentState.operation ?? ''}`;
        this.statusBarItem.tooltip = 'Running latency benchmark...';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'indexing':
        const indexPct =
          this.currentState.progressPercent !== undefined
            ? ` ${this.currentState.progressPercent}%`
            : '';
        this.statusBarItem.text = `$(database) CodePulse: Indexing${indexPct}`;
        this.statusBarItem.tooltip = 'Local file and symbol indexing in progress...';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'warmup':
        const warmupPct =
          this.currentState.progressPercent !== undefined
            ? ` ${this.currentState.progressPercent}%`
            : '';
        this.statusBarItem.text = `$(flame) CodePulse: Warmup${warmupPct}`;
        this.statusBarItem.tooltip = 'Warming up priority files for fast navigation...';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'paused':
        this.statusBarItem.text = '$(debug-pause) CodePulse: Paused';
        this.statusBarItem.tooltip = `CodePulse paused: ${this.currentState.reason ?? 'User activity detected'}`;
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'issues':
        this.statusBarItem.text = `$(warning) CodePulse: ${this.currentState.count} Issues`;
        this.statusBarItem.tooltip = `Detected ${this.currentState.count} performance issues in workspace configuration`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;

      case 'error':
        this.statusBarItem.text = '$(error) CodePulse: Error';
        this.statusBarItem.tooltip = `CodePulse error: ${this.currentState.message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}

export const statusBar = StatusBarController.getInstance();
