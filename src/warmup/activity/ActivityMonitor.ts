import * as vscode from 'vscode';
import { Disposable } from '../../core/lifecycle/Disposable';

export type ActivityLevel = 'idle' | 'low' | 'high';

export interface ActivityMonitorOptions {
  highToLowCooldownMs?: number;
  lowToIdleCooldownMs?: number;
}

export class ActivityMonitor extends Disposable {
  private level: ActivityLevel = 'idle';
  private cooldownTimer: NodeJS.Timeout | null = null;
  private readonly _onDidChangeActivity = new vscode.EventEmitter<ActivityLevel>();
  public readonly onDidChangeActivity = this._onDidChangeActivity.event;

  private readonly highToLowCooldownMs: number;
  private readonly lowToIdleCooldownMs: number;

  constructor(options?: ActivityMonitorOptions) {
    super();
    this.highToLowCooldownMs = options?.highToLowCooldownMs ?? 1500;
    this.lowToIdleCooldownMs = options?.lowToIdleCooldownMs ?? 800;

    this.registerDisposables();
  }

  public getLevel(): ActivityLevel {
    return this.level;
  }

  public isIdle(): boolean {
    return this.level === 'idle';
  }

  public isHigh(): boolean {
    return this.level === 'high';
  }

  public recordEdit(): void {
    this.transitionTo('high');
    this.scheduleCooldown();
  }

  public recordSelectionChange(): void {
    // Selection change indicates user interaction -> low activity if idle
    if (this.level === 'idle') {
      this.transitionTo('low');
    }
    this.scheduleCooldown();
  }

  public recordEditorChange(): void {
    if (this.level === 'idle') {
      this.transitionTo('low');
    }
    this.scheduleCooldown();
  }

  public recordNavigationActivity(): void {
    this.transitionTo('high');
    this.scheduleCooldown();
  }

  public recordWindowStateChange(focused: boolean): void {
    if (!focused) {
      // Window unfocused -> user not active in VS Code, step down to idle quickly
      this.transitionTo('idle');
      this.clearCooldownTimer();
    } else {
      if (this.level === 'idle') {
        this.transitionTo('low');
        this.scheduleCooldown();
      }
    }
  }

  private registerDisposables(): void {
    // 1. Document edits -> rapid typing causes background throttling
    this.register(
      vscode.workspace.onDidChangeTextDocument((e) => {
        // Ignore output channels or git schemes if needed, but any user document edit = typing
        if (e.contentChanges.length > 0) {
          this.recordEdit();
        }
      })
    );

    // 2. Active editor change
    this.register(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.recordEditorChange();
      })
    );

    // 3. Selection change
    this.register(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        // Only trigger if user-initiated text editor
        if (e.kind !== undefined) {
          this.recordSelectionChange();
        }
      })
    );

    // 4. Window focus change
    this.register(
      vscode.window.onDidChangeWindowState((state) => {
        this.recordWindowStateChange(state.focused);
      })
    );
  }

  private transitionTo(newLevel: ActivityLevel): void {
    if (this.level !== newLevel) {
      this.level = newLevel;
      this._onDidChangeActivity.fire(this.level);
    }
  }

  private scheduleCooldown(): void {
    this.clearCooldownTimer();

    const delay = this.level === 'high' ? this.highToLowCooldownMs : this.lowToIdleCooldownMs;

    this.cooldownTimer = setTimeout(() => {
      if (this.level === 'high') {
        this.transitionTo('low');
        // Now schedule cooldown from low to idle
        this.scheduleCooldown();
      } else if (this.level === 'low') {
        this.transitionTo('idle');
      }
    }, delay);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  public override dispose(): void {
    this.clearCooldownTimer();
    this._onDidChangeActivity.dispose();
    super.dispose();
  }
}
