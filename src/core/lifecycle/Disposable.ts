import * as vscode from 'vscode';

export abstract class Disposable implements vscode.Disposable {
  private _disposables: vscode.Disposable[] = [];
  private _isDisposed = false;

  protected register<T extends vscode.Disposable>(disposable: T): T {
    if (this._isDisposed) {
      disposable.dispose();
    } else {
      this._disposables.push(disposable);
    }
    return disposable;
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error('Error disposing object:', err);
      }
    }
    this._disposables = [];
  }
}
