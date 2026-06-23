import { generateText, type CoreMessage } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { ToolRegistry } from '../tools/registry';
import { StreamBridge } from './stream-bridge';
import { logInfo, logError } from '../utils/logger';
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
 * Uses a manual tool loop (maxSteps: 1) so we can pause for user approval
 * on write/execute tools before executing them.
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
  private lastError: string | null = null;

  constructor(
    private readonly chatModel: LanguageModelV1,
    private readonly toolRegistry: ToolRegistry,
    private readonly getSystemContext?: () => Promise<string>
  ) {
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
      // Use SDK's built-in multi-step tool calling — handles all message formatting correctly
      const result = await generateText({
        model: this.chatModel,
        messages: allMessages,
        tools: this.toolRegistry.getAISDKTools(),
        maxSteps: 15, // SDK handles tool execution loop automatically
        temperature: 0.3,
        maxTokens: 4096,
        abortSignal: this.abortController!.signal,
        onStepFinish: ({ text, toolCalls, toolResults }) => {
          if (text) {
            this.lastStreamText += text;
            this.streamBridge.sendToken(text);
          }
          if (toolCalls) {
            for (const tc of toolCalls) {
              const dn = this.toolRegistry.getDisplayName(tc.toolName) || tc.toolName;
              this.lastToolCalls.push({ id: tc.toolCallId, name: tc.toolName, displayName: dn, args: tc.args });
              this.streamBridge.sendToolCall(tc.toolCallId, tc.toolName, dn, tc.args);
            }
          }
          if (toolResults) {
            for (const tr of toolResults) {
              this.lastToolResults.push({ id: tr.toolCallId, name: tr.toolName, result: String(tr.result), success: !tr.error });
              this.streamBridge.sendToolResult(tr.toolCallId, tr.toolName, String(tr.result), !tr.error);
            }
          }
        },
      });

      const fullText = result.text || '';

      // Append new messages to history
      for (const msg of result.response.messages) {
        if (msg.role !== 'system') {
          this.history.push(msg);
        }
      }
      // Save full history (including tool calls) for session resume
      if (this.workspacePath && this.getSessionId) {
        saveFullHistory(this.workspacePath, this.getSessionId(), this.history);
      }

      // Send final text as chunks for visual effect
      // Text already sent via onStepFinish — just mark done
      this.isGenerating = false;
      this.streamBridge.sendDone();
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') { this.isGenerating = false; throw err; }
      // If tools cause 400, retry without tools
      if (err.statusCode === 400 || (err.message && err.message.includes('Bad Request'))) {
        logInfo('Tool call failed (400), retrying without tools');
        this.streamBridge.sendToken('(Tools unavailable, using basic chat)\n');
        try {
          const result = await generateText({
            model: this.chatModel,
            messages: allMessages.filter(m => m.role !== 'system'),
            temperature: 0.3,
            maxTokens: 4096,
            abortSignal: this.abortController!.signal,
          });
          const text = result.text || '';
          this.history.push({ role: 'assistant', content: text } as CoreMessage);
          this.streamBridge.sendToken(text);
          this.isGenerating = false;
          this.streamBridge.sendDone();
          if (this.workspacePath && this.getSessionId) {
            saveFullHistory(this.workspacePath, this.getSessionId(), this.history);
          }
          return;
        } catch (retryErr: any) {
          if (retryErr.name === 'AbortError') { this.isGenerating = false; throw retryErr; }
          logError('Retry without tools also failed', retryErr);
          this.lastError = retryErr.message;
          this.isGenerating = false;
          this.streamBridge.sendError(retryErr.message);
          return;
        }
      }
      logError('Error in chat loop', err);
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
