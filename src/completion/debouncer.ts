import * as vscode from 'vscode';

/**
 * Debounces inline completion requests to avoid excessive API calls.
 * Tracks state per-document so switching files doesn't incorrectly debounce.
 */
export class CompletionDebouncer implements vscode.Disposable {
  private timers = new Map<string, NodeJS.Timeout>();
  private lastRequestByDoc = new Map<string, number>();
  private delay: number;
  private disposables: vscode.Disposable[] = [];

  constructor(delayMs: number = 300) {
    this.delay = delayMs;
  }

  /**
   * Returns true if the request should be skipped (debounced).
   * Returns false if the request should proceed.
   * State is tracked per-document to avoid cross-file interference.
   */
  shouldDebounce(document: vscode.TextDocument, position: vscode.Position): boolean {
    const key = document.uri.toString();
    const now = Date.now();
    const last = this.lastRequestByDoc.get(key) || 0;
    if (now - last < this.delay) {
      return true;
    }
    this.lastRequestByDoc.set(key, now);
    return false;
  }

  /** Reset the debounce timer for all documents */
  reset(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.lastRequestByDoc.clear();
  }

  /** Wait for the debounce period to elapse */
  async wait(): Promise<void> {
    this.reset();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete('global');
        resolve();
      }, this.delay);
      this.timers.set('global', timer);
    });
  }

  updateDelay(delayMs: number): void {
    this.delay = delayMs;
  }

  dispose(): void {
    this.reset();
    this.disposables.forEach((d) => d.dispose());
  }
}
