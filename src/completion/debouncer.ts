import * as vscode from 'vscode';

/**
 * Debounces inline completion requests to avoid excessive API calls.
 * Tracks state per-document so switching files doesn't incorrectly debounce.
 *
 * Uses a "schedule and wait" pattern: each call to schedule() cancels the
 * previous timer for that document and starts a new one. The returned promise
 * resolves after the delay elapses (or is rejected if cancelled by a new call).
 * This ensures completions are never dropped — they're just delayed.
 */
export class CompletionDebouncer implements vscode.Disposable {
  private controllers = new Map<string, { abort: () => void; timer: NodeJS.Timeout }>();
  private delay: number;
  private disposables: vscode.Disposable[] = [];

  constructor(delayMs: number = 300) {
    this.delay = delayMs;
  }

  /**
   * Schedule a debounced action for a document. Cancels any previous
   * pending action for the same document. Returns a promise that resolves
   * after the debounce delay, or rejects with 'cancelled' if a new schedule
   * call cancels it.
   *
   * Usage in InlineCompletionItemProvider:
   * ```
   * try {
   *   await debouncer.schedule(document);
   *   // ... make API call and return results
   * } catch {
   *   return [];
   * }
   * ```
   */
  schedule(document: vscode.TextDocument): Promise<void> {
    const key = document.uri.toString();

    // Cancel any previous pending action for this document
    const prev = this.controllers.get(key);
    if (prev) {
      clearTimeout(prev.timer);
      prev.abort();
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.controllers.delete(key);
        resolve();
      }, this.delay);

      this.controllers.set(key, {
        abort: () => reject(new Error('cancelled')),
        timer,
      });
    });
  }

  /**
   * Returns true if the request should be skipped (debounced).
   * Kept for backward compatibility; prefer using schedule() instead.
   */
  shouldDebounce(document: vscode.TextDocument, _position: vscode.Position): boolean {
    const key = document.uri.toString();
    return this.controllers.has(key);
  }

  /** Reset all pending timers */
  reset(): void {
    for (const [, ctrl] of this.controllers) {
      clearTimeout(ctrl.timer);
      ctrl.abort();
    }
    this.controllers.clear();
  }

  updateDelay(delayMs: number): void {
    this.delay = delayMs;
  }

  dispose(): void {
    this.reset();
    this.disposables.forEach((d) => d.dispose());
  }
}
