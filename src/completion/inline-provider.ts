import * as vscode from 'vscode';
import { CompletionDebouncer } from './debouncer';
import { CompletionCtxBuilder } from './ctx-builder';
import { CompletionEngine } from '../ai/completion-engine';
import { logInfo } from '../utils/logger';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private debouncer: CompletionDebouncer;
  private ctxBuilder: CompletionCtxBuilder;
  private engine: CompletionEngine | null = null;
  private enabled = true;
  private disposables: vscode.Disposable[] = [];
  private getApiKey?: () => string | undefined;
  private getBaseURL?: () => string | undefined;
  private getProvider?: () => string | undefined;

  constructor() {
    this.debouncer = new CompletionDebouncer(300);
    this.ctxBuilder = new CompletionCtxBuilder();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('aiCodingAgent.completionsEnabled')) {
          this.enabled = vscode.workspace.getConfiguration('aiCodingAgent').get<boolean>('completionsEnabled') ?? true;
        }
        if (e.affectsConfiguration('aiCodingAgent.completionDebounceMs')) {
          const delay = vscode.workspace.getConfiguration('aiCodingAgent').get<number>('completionDebounceMs') ?? 300;
          this.debouncer.updateDelay(delay);
        }
      })
    );
  }

  setEngine(engine: CompletionEngine): void {
    this.engine = engine;
    logInfo('Completion engine set');
  }

  setApiKeyProvider(fn: () => string | undefined): void {
    this.getApiKey = fn;
  }

  setBaseURLProvider(fn: () => string | undefined): void {
    this.getBaseURL = fn;
  }

  setProviderProvider(fn: () => string | undefined): void {
    this.getProvider = fn;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {
    if (!this.enabled) { logInfo('Completion: disabled'); return []; }
    if (!this.engine) { logInfo('Completion: no engine'); return []; }

    const isManual = context.triggerKind === vscode.InlineCompletionTriggerKind.Explicit;

    // Debounce: wait for typing to pause, or cancel on next keystroke
    if (!isManual) {
      try {
        await this.debouncer.schedule(document);
      } catch {
        return []; // cancelled by a newer keystroke
      }
    }

    const ctx = this.ctxBuilder.build(document, position);
    if (!ctx) { logInfo('Completion: file too large or no context'); return []; }

    logInfo(`Completion triggered: ${ctx.language}, prefix=${ctx.prefix.length} chars, manual=${isManual}`);

    const abortController = new AbortController();
    token.onCancellationRequested(() => abortController.abort());

    const apiKey = this.getApiKey?.();
    if (!apiKey) { logInfo('Completion: no API key'); return []; }
    const provider = this.getProvider?.() || 'anthropic';

    try {
      const completion = await this.engine.generate(ctx.prefix, ctx.suffix, provider, apiKey, this.getBaseURL?.(), abortController.signal);
      if (!completion) { logInfo('Completion: empty response'); return []; }

      const processed = this.postProcess(completion, document, position);
      if (!processed) { logInfo('Completion: empty after postProcess'); return []; }

      logInfo(`Completion: returning ${processed.length} chars: "${processed.substring(0, 50)}"`);
      return [new vscode.InlineCompletionItem(
        processed,
        new vscode.Range(position, position)
      )];
    } catch (err: any) {
      logInfo(`Completion error: ${err.message}`);
      return [];
    }
  }

  private postProcess(
    completion: string,
    document: vscode.TextDocument,
    position: vscode.Position
  ): string | null {
    let text = completion;
    const afterCursor = document.getText(
      new vscode.Range(position, document.lineAt(position.line).range.end)
    );
    if (afterCursor && afterCursor.length > 0) {
      let matchLen = 0;
      for (let i = 0; i < Math.min(text.length, afterCursor.length); i++) {
        if (text[i] === afterCursor[i]) matchLen++;
        else break;
      }
      if (matchLen > 0 && matchLen < text.length) {
        text = text.substring(matchLen);
      }
      if (matchLen === afterCursor.length && matchLen > 0) {
        text = text.substring(matchLen);
      }
    }
    if (!text.trim()) return null;
    return text;
  }

  dispose(): void {
    this.debouncer.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
