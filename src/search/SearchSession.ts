import * as vscode from 'vscode';
import { cancellationManager } from '../core/cancellation/CancellationManager';
import { SearchMode } from '../core/interfaces/ISearchService';

export class SearchSession {
  public readonly sessionId: string;
  private currentRequestId = 0;
  private currentTokenSource?: vscode.CancellationTokenSource;

  constructor(sessionId = `session-${Date.now()}`) {
    this.sessionId = sessionId;
  }

  public nextRequest(
    _query?: string,
    _mode?: SearchMode
  ): {
    requestId: number;
    token: vscode.CancellationToken;
    startedAt: number;
  } {
    // Cancel any ongoing request in this session
    if (this.currentTokenSource) {
      this.currentTokenSource.cancel();
      this.currentTokenSource.dispose();
    }

    this.currentRequestId++;
    const reqIdStr = `${this.sessionId}:req-${this.currentRequestId}`;
    this.currentTokenSource = cancellationManager.createTokenSource(reqIdStr, this.sessionId);

    return {
      requestId: this.currentRequestId,
      token: this.currentTokenSource.token,
      startedAt: performance.now(),
    };
  }

  public isLatest(requestId: number): boolean {
    return this.currentRequestId === requestId;
  }

  public cancel(): void {
    if (this.currentTokenSource) {
      this.currentTokenSource.cancel();
      this.currentTokenSource.dispose();
      this.currentTokenSource = undefined;
    }
    cancellationManager.cancelGroup(this.sessionId);
  }

  public dispose(): void {
    this.cancel();
  }
}
