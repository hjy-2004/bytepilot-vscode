import type { ExtensionMessage } from '../types/ipc';

/**
 * Adapts AI SDK stream events to WebView IPC messages.
 * Decouples the AI engine from the UI transport layer.
 */
export class StreamBridge {
  private callback: ((msg: ExtensionMessage) => void) | null = null;
  private cancelled = false;

  setCallback(callback: (msg: ExtensionMessage) => void): void {
    this.callback = callback;
  }

  sendToken(text: string): void {
    if (this.cancelled) return;
    this.callback?.({
      type: 'chat.token',
      payload: { text },
    });
  }

  sendToolCall(
    id: string,
    name: string,
    displayName: string,
    args: Record<string, unknown>
  ): void {
    if (this.cancelled) return;
    this.callback?.({
      type: 'chat.toolCall',
      payload: { id, name, displayName, args },
    });
  }

  sendToolResult(
    id: string,
    name: string,
    result: string,
    success: boolean,
    diff?: import('../types/diff').UnifiedDiff,
  ): void {
    if (this.cancelled) return;
    this.callback?.({
      type: 'chat.toolResult',
      payload: { id, name, result, success, diff },
    });
  }

  sendRequestApproval(
    toolCallId: string,
    toolName: string,
    displayName: string,
    args: Record<string, unknown>
  ): void {
    this.callback?.({
      type: 'tool.requestApproval',
      payload: { toolCallId, toolName, displayName, args },
    });
  }

  sendDone(usage?: { inputTokens: number; outputTokens: number }): void {
    if (this.cancelled) return;
    this.callback?.({
      type: 'chat.done',
      payload: { usage },
    });
  }

  sendError(message: string, code?: string): void {
    this.callback?.({
      type: 'chat.error',
      payload: { message, code },
    });
  }

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }
}
