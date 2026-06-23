import * as vscode from 'vscode';

/**
 * Debounces inline completion requests to avoid excessive API calls.
 * Only fires when the user has stopped typing for `delay` milliseconds.
 */
export class CompletionDebouncer implements vscode.Disposable {
  private timer: NodeJS.Timeout | null = null;
  private lastRequestTime = 0;
  private delay: number;
  private disposables: vscode.Disposable[] = [];

  constructor(delayMs: number = 300) {
    this.delay = delayMs;
  }

  /**
   * Returns true if the request should be skipped (debounced).
   * Returns false if the request should proceed.
   */
  shouldDebounce(document: vscode.TextDocument, position: vscode.Position): boolean {
    const now = Date.now();
    if (now - this.lastRequestTime < this.delay) {
      return true;
    }
    this.lastRequestTime = now;
    return false;
  }

  /** Reset the debounce timer */
  reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lastRequestTime = 0;
  }

  /** Wait for the debounce period to elapse */
  async wait(): Promise<void> {
    this.reset();
    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.lastRequestTime = Date.now();
        resolve();
      }, this.delay);
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
