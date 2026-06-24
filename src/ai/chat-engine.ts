import { streamText, type CoreMessage } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { ToolRegistry } from '../tools/registry';
import { StreamBridge } from './stream-bridge';
import { logInfo, logError } from '../utils/logger';
import { logAiRequestStart, logAiCompletion, logAiError } from '../utils/ai-logger';
import { saveFullHistory } from '../chat/history';
import type { PendingApproval } from '../types/chat';

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into VS Code. You help developers write, understand, and debug code.

## Available Tools
You have access to these tools. When tools are available as native function calls, use them. Otherwise, describe what tool you would use and I will execute it.

__TOOLS_PLACEHOLDER__

## Guidelines
- **For editing existing files, ALWAYS use edit_file** (never write_file). Only use write_file for creating new files.
- When using edit_file, include just enough surrounding context in oldString to make it unique.
- Always read a file with read_file before editing it.
- Keep import statements at the top of the file — use edit_file to insert new imports above existing code.
- Use workspace-relative paths (e.g., "src/index.ts").
- Keep responses concise; show code over explanation.
- When you see errors, check diagnostics first.
- Follow the project's existing code style.`;

/**
 * Core chat engine that manages AI conversations with tool calling.
 *
 * Uses streamText() for per-token streaming output, with multi-step
 * tool calling (maxSteps: 15) handled automatically by the AI SDK.
 */
export class ChatEngine {
  private history: CoreMessage[] = [];
  private activeApproval: PendingApproval | null = null;
  private abortController: AbortController | null = null;
  private streamBridge: StreamBridge;
  private workspacePath: string = '';
  private isGenerating: boolean = false;
  private lastStreamText: string = '';
  private lastToolCalls: Array<{ id: string; name: string; displayName: string; args: Record<string, unknown> }> = [];
  private lastToolResults: Array<{ id: string; name: string; result: string; success: boolean }> = [];
  private toolDiffs: Map<string, import('../types/diff').UnifiedDiff> = new Map();
  private lastError: string | null = null;
  private readonly provider: string;
  private readonly baseURL?: string;

  constructor(
    private readonly chatModel: LanguageModelV1,
    private readonly toolRegistry: ToolRegistry,
    private readonly getSystemContext?: () => Promise<string>,
    provider?: string,
    baseURL?: string,
  ) {
    this.provider = provider || 'unknown';
    this.baseURL = baseURL;
    this.streamBridge = new StreamBridge();
  }

  private getSessionId?: () => string;

  setWorkspacePath(wsPath: string): void {
    this.workspacePath = wsPath;
  }

  setSessionIdProvider(fn: () => string): void {
    this.getSessionId = fn;
  }

  private resetStreamState(): void {
    this.isGenerating = true;
    this.lastStreamText = '';
    this.lastToolCalls = [];
    this.lastToolResults = [];
    this.lastError = null;
  }

  /** Set the callback for streaming messages to the WebView */
  onStreamEvent(callback: (msg: import('../types/ipc').ExtensionMessage) => void): void {
    this.streamBridge.setCallback(callback);
  }

  /** Start a new chat session */
  async sendMessage(
    userContent: string,
    onToolApprovalNeeded?: (
      toolCallId: string,
      toolName: string,
      displayName: string,
      args: Record<string, unknown>
    ) => Promise<boolean>
  ): Promise<void> {
    // Cancel any in-progress request
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.resetStreamState();

    // Add user message to history
    this.history.push({ role: 'user', content: userContent });

    // Will save full history after response completes

    try {
      await this.runChatLoop(onToolApprovalNeeded);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logInfo('Chat request cancelled by user');
        this.streamBridge.sendError('Request cancelled.');
      } else {
        logError('Chat engine error', err);
        this.streamBridge.sendError(err.message || 'An unknown error occurred.');
      }
      throw err;
    }
  }

  /** Main chat loop: send to AI, handle tool calls, repeat until done */
  private async runChatLoop(
    onToolApprovalNeeded?: (
      toolCallId: string,
      toolName: string,
      displayName: string,
      args: Record<string, unknown>
    ) => Promise<boolean>
  ): Promise<void> {
    const systemContext = this.getSystemContext ? await this.getSystemContext() : '';
    const toolDescriptions = this.toolRegistry.getSystemPromptTools();
    const basePrompt = SYSTEM_PROMPT.replace('__TOOLS_PLACEHOLDER__', toolDescriptions);
    const systemMessage = systemContext
      ? `${basePrompt}\n\n## Current Workspace Context\n${systemContext}`
      : basePrompt;

    const allMessages: CoreMessage[] = [
      { role: 'system', content: systemMessage },
      ...this.history,
    ];

    try {
      const startTime = Date.now();
      const tools = this.toolRegistry.list();
      logAiRequestStart({
        provider: this.provider,
        model: (this.chatModel as any).modelId || 'unknown',
        baseURL: this.baseURL,
        temperature: 0.3,
        maxTokens: 4096,
        maxSteps: 15,
        systemPromptLength: systemMessage.length,
        messageCount: allMessages.length,
        toolCount: tools.length,
        toolNames: tools.map(t => t.name),
      });

      // Use streamText for per-token streaming output with multi-step tool calling
      const result = streamText({
        model: this.chatModel,
        messages: allMessages,
        tools: this.toolRegistry.getAISDKTools(),
        maxSteps: 15,
        temperature: 0.3,
        maxTokens: 4096,
        abortSignal: this.abortController!.signal,
      });

      // Consume the full stream: per-token text deltas + tool events
      type Chunk = { type: string; textDelta?: string; toolCallId?: string; toolName?: string; args?: unknown; result?: unknown; error?: unknown };
      for await (const raw of result.fullStream) {
        const c = raw as unknown as Chunk;
        if (c.type === 'text-delta' && c.textDelta !== undefined) {
          this.lastStreamText += c.textDelta;
          this.streamBridge.sendToken(c.textDelta);
        } else if (c.type === 'tool-call' && c.toolCallId && c.toolName) {
          const dn = this.toolRegistry.getDisplayName(c.toolName) || c.toolName;
          this.lastToolCalls.push({ id: c.toolCallId, name: c.toolName, displayName: dn, args: (c.args || {}) as Record<string, unknown> });
          this.streamBridge.sendToolCall(c.toolCallId, c.toolName, dn, (c.args || {}) as Record<string, unknown>);
        } else if (c.type === 'tool-result' && c.toolCallId && c.toolName) {
          const diff = this.toolRegistry.consumeLastDiff();
          if (diff) {
            this.toolDiffs.set(c.toolCallId, diff);
          }
          this.lastToolResults.push({ id: c.toolCallId, name: c.toolName, result: String(c.result ?? ''), success: !c.error });
          this.streamBridge.sendToolResult(c.toolCallId, c.toolName, String(c.result ?? ''), !c.error, diff);
        } else if (c.type === 'error') {
          throw c.error;
        }
      }

      // After stream completes, get response messages for history
      const response = await result.response;
      for (const msg of response.messages) {
        this.history.push(msg);
      }
      // Save full history (including tool calls) for session resume
      if (this.workspacePath && this.getSessionId) {
        saveFullHistory(this.workspacePath, this.getSessionId(), this.history, this.toolDiffs);
        this.toolDiffs.clear();
      }

      this.isGenerating = false;
      this.streamBridge.sendDone();

      logAiCompletion({
        inputTokens: (response as any).usage?.promptTokens,
        outputTokens: (response as any).usage?.completionTokens,
        durationMs: Date.now() - startTime,
      });

      return;
    } catch (err: any) {
      if (err.name === 'AbortError') { this.isGenerating = false; throw err; }
      // If tools cause 400, retry without tools
      if (err.statusCode === 400 || (err.message && err.message.includes('Bad Request'))) {
        logAiError('Tool calling not supported, retrying without tools', '400');
        logInfo('Tool call failed (400), retrying without tools');
        this.streamBridge.sendToken('(Tools unavailable, using basic chat)\n');
        try {
          const result2 = streamText({
            model: this.chatModel,
            messages: allMessages.filter(m => m.role !== 'system'),
            temperature: 0.3,
            maxTokens: 4096,
            abortSignal: this.abortController!.signal,
          });
          let fullText = '';
          for await (const raw of result2.fullStream) {
            const c = raw as unknown as { type: string; textDelta?: string };
            if (c.type === 'text-delta' && c.textDelta !== undefined) {
              fullText += c.textDelta;
              this.streamBridge.sendToken(c.textDelta);
            }
          }
          this.history.push({ role: 'assistant', content: fullText } as CoreMessage);
          this.isGenerating = false;
          this.streamBridge.sendDone();
          if (this.workspacePath && this.getSessionId) {
            saveFullHistory(this.workspacePath, this.getSessionId(), this.history, this.toolDiffs);
            this.toolDiffs.clear();
          }
          return;
        } catch (retryErr: any) {
          if (retryErr.name === 'AbortError') { this.isGenerating = false; throw retryErr; }
          logError('Retry without tools also failed', retryErr);
          logAiError(retryErr.message);
          this.lastError = retryErr.message;
          this.isGenerating = false;
          this.streamBridge.sendError(retryErr.message);
          return;
        }
      }
      logError('Error in chat loop', err);
      logAiError(err.message, err.statusCode ? String(err.statusCode) : undefined);
      this.lastError = err.message;
      this.isGenerating = false;
      this.streamBridge.sendError(err.message);
    }
  }

  /** Clear conversation history */
  clearHistory(): void {
    this.history = [];
  }

  /** Cancel the current request */
  cancel(): void {
    this.streamBridge.cancel();
    this.abortController?.abort();
  }

  /** Get the current history */
  getHistory(): CoreMessage[] {
    return [...this.history];
  }

  /** Set history from saved session */
  setHistory(history: CoreMessage[]): void {
    this.history = history;
  }

  /** Whether the engine is currently generating a response */
  getIsGenerating(): boolean {
    return this.isGenerating;
  }

  /** Get persisted tool diffs for session restore */
  getToolDiffs(): Map<string, import('../types/diff').UnifiedDiff> {
    return this.toolDiffs;
  }

  /** Get current stream state for reconnection */
  getStreamSnapshot(): {
    text: string;
    toolCalls: Array<{ id: string; name: string; displayName: string; args: Record<string, unknown> }>;
    toolResults: Array<{ id: string; name: string; result: string; success: boolean }>;
    error: string | null;
  } {
    return {
      text: this.lastStreamText,
      toolCalls: [...this.lastToolCalls],
      toolResults: [...this.lastToolResults],
      error: this.lastError,
    };
  }

  /** Reconnect a new stream listener after webview recreation */
  reconnectStream(callback: (msg: import('../types/ipc').ExtensionMessage) => void): void {
    this.streamBridge.setCallback(callback);
    // Send current accumulated text so the new webview sees what's been generated so far
    if (this.lastStreamText) {
      callback({ type: 'chat.token', payload: { text: this.lastStreamText } });
    }
    // Note: toolCalls and toolResults are NOT replayed — they would appear
    // out of order. The final response text (above) is sufficient context.
  }
}
