import * as vscode from 'vscode';

/**
 * Helper to collect and dispose multiple disposable objects.
 */
export class DisposableStore implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  add(disposable: vscode.Disposable): void {
    this.disposables.push(disposable);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
