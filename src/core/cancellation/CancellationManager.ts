import * as vscode from 'vscode';
import { ICancellationManager } from './ICancellationManager';

export function createCancellationError(message = 'Canceled'): Error {
  if (typeof (vscode as any).CancellationError === 'function') {
    return new (vscode as any).CancellationError(message);
  }
  const err = new Error(message);
  err.name = 'CancellationError';
  return err;
}

interface TrackedToken {
  source: vscode.CancellationTokenSource;
  groupId?: string;
}

export class CancellationManager implements ICancellationManager {
  private static instance: CancellationManager | null = null;
  private tokens = new Map<string, TrackedToken>();

  public static getInstance(): CancellationManager {
    if (!CancellationManager.instance) {
      CancellationManager.instance = new CancellationManager();
    }
    return CancellationManager.instance;
  }

  public createTokenSource(id: string, groupId?: string): vscode.CancellationTokenSource {
    const existing = this.tokens.get(id);
    if (existing) {
      existing.source.cancel();
      existing.source.dispose();
      this.tokens.delete(id);
    }

    const source = new vscode.CancellationTokenSource();
    this.tokens.set(id, { source, groupId });
    return source;
  }

  public getToken(id: string): vscode.CancellationToken | undefined {
    return this.tokens.get(id)?.source.token;
  }

  public cancel(id: string): boolean {
    const tracked = this.tokens.get(id);
    if (tracked) {
      tracked.source.cancel();
      tracked.source.dispose();
      this.tokens.delete(id);
      return true;
    }
    return false;
  }

  public cancelGroup(groupId: string): number {
    let count = 0;
    for (const [id, tracked] of Array.from(this.tokens.entries())) {
      if (tracked.groupId === groupId) {
        tracked.source.cancel();
        tracked.source.dispose();
        this.tokens.delete(id);
        count++;
      }
    }
    return count;
  }

  public disposeToken(id: string): void {
    const tracked = this.tokens.get(id);
    if (tracked) {
      tracked.source.dispose();
      this.tokens.delete(id);
    }
  }

  public clear(): void {
    for (const tracked of this.tokens.values()) {
      tracked.source.cancel();
      tracked.source.dispose();
    }
    this.tokens.clear();
  }
}

export const cancellationManager = CancellationManager.getInstance();
