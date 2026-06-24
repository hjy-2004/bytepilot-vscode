import * as vscode from 'vscode';
import { ChatPanel } from './panel';
import { ChatEngine } from '../ai/chat-engine';
import { ToolRegistry } from '../tools/registry';
import { getConfigState } from '../config/settings';
import { scanKnownLocations, importCachedConfig } from '../config/importer';
import { listSessions, createSession as createSessionFile, switchSession as switchSessionFile, deleteSession as deleteSessionFile, loadSessionMessages, loadSessionDiffs } from './history';
import { logInfo, logError } from '../utils/logger';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';
import type { CoreMessage } from 'ai';

type PostMessageFn = (msg: ExtensionMessage) => void;

/**
 * Routes WebView messages to the appropriate handlers.
 * Works with both WebviewPanel (ChatPanel) and WebviewView (sidebar).
 */
export class MessageRouter implements vscode.Disposable {
  private chatEngine: ChatEngine | null = null;
  private disposables: vscode.Disposable[] = [];
  private pendingApprovalResolver: Map<string, {
    resolve: (approved: boolean) => void;
    reject: (reason: string) => void;
  }> = new Map();

  private activeSessionId: string | null = null;
  private workspacePath: string = '';
  private onSessionSwitch?: (sessionId: string) => void;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly onImportRequest?: () => Promise<void>,
    private readonly onManualSetup?: () => void,
    private readonly onImportCached?: (sourcePath: string) => Promise<void>,
    private readonly createEngineFn?: () => ChatEngine | null,
  ) {}

  setWorkspacePath(wsPath: string): void {
    this.workspacePath = wsPath;
  }

  setActiveSession(sessionId: string): void {
    this.activeSessionId = sessionId;
    logInfo(`Router active session set: ${sessionId}`);
  }

  getActiveSession(): string | null {
    if (!this.activeSessionId && this.workspacePath) {
      // Auto-create a session if none exists
      const sessions = listSessions(this.workspacePath);
      if (sessions.length > 0) {
        this.activeSessionId = sessions[0].id;
      } else {
        const s = createSessionFile(this.workspacePath);
        this.activeSessionId = s.id;
      }
      logInfo(`Router auto-created session: ${this.activeSessionId}`);
    }
    return this.activeSessionId;
  }

  onSwitchSession(cb: (sessionId: string) => void): void {
    this.onSessionSwitch = cb;
  }

  private streamResponder: PostMessageFn | null = null;

  setChatEngine(engine: ChatEngine, streamResponder?: PostMessageFn): void {
    this.chatEngine = engine;
    this.streamResponder = streamResponder || null;
    engine.onStreamEvent((msg) => {
      // Use the streamResponder if set, otherwise fall back to ChatPanel
      if (this.streamResponder) {
        this.streamResponder(msg);
      } else {
        ChatPanel.current()?.postMessage(msg);
      }
    });
  }

  /**
   * Handle a message. If `respond` callback is provided, use it for responses.
   * Otherwise, fall back to ChatPanel.current() (for webview panels opened via command).
   */
  async handle(message: WebViewMessage, respond?: PostMessageFn): Promise<void> {
    // Store responder for stream events from this source
    if (respond) {
      this.streamResponder = respond;
    }

    const reply = (msg: ExtensionMessage) => {
      if (respond) {
        respond(msg);
      } else {
        ChatPanel.current()?.postMessage(msg);
      }
    };

    switch (message.type) {
      // ---- Chat (requires ChatPanel) ----
      case 'chat.send': {
        if (!this.chatEngine && this.createEngineFn) {
          this.chatEngine = this.createEngineFn() || null;
        }
        if (!this.chatEngine) {
          reply({ type: 'chat.error', payload: { message: 'AI engine not ready. Check your provider configuration.' } });
          return;
        }
        // Always rewire stream to the active webview (sidebar or panel)
        this.chatEngine.onStreamEvent((msg) => {
          if (this.streamResponder) {
            this.streamResponder(msg);
          } else {
            ChatPanel.current()?.postMessage(msg);
          }
        });
        try {
          await this.chatEngine.sendMessage(
            message.payload.content,
            async (toolCallId, toolName, displayName, args) => {
              reply({ type: 'tool.requestApproval', payload: { toolCallId, toolName, displayName, args } });
              return new Promise((resolve, reject) => {
                this.pendingApprovalResolver.set(toolCallId, { resolve, reject });
                setTimeout(() => {
                  if (this.pendingApprovalResolver.has(toolCallId)) {
                    this.pendingApprovalResolver.delete(toolCallId);
                    resolve(false);
                  }
                }, 60000);
              });
            }
          );
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            logError('Chat error', err);
            reply({ type: 'chat.error', payload: { message: err.message || 'Chat failed' } });
          }
        }
        break;
      }

      case 'chat.cancel': {
        this.chatEngine?.cancel();
        for (const [id, { resolve }] of this.pendingApprovalResolver) {
          resolve(false);
        }
        this.pendingApprovalResolver.clear();
        break;
      }

      case 'chat.clear': {
        this.chatEngine?.clearHistory();
        reply({ type: 'chat.clear' });
        break;
      }

      case 'chat.restore': {
        if (this.chatEngine) {
          // If generating, reconnect to the live stream
          if (this.chatEngine.getIsGenerating()) {
            this.chatEngine.reconnectStream((msg) => {
              // Only forward new messages, not historical data
              reply(msg);
            });
            break;
          }

          const history = this.chatEngine.getHistory();
          const ws = this.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
          const sid = this.getActiveSession();
          // Load diffs from disk (in-memory toolDiffs is cleared after saveFullHistory)
          const diffs = sid ? loadSessionDiffs(ws, sid) : new Map();
          logInfo(`chat.restore: loaded ${diffs.size} diffs from disk for session ${sid}`);
          reply({
            type: 'chat.state',
            payload: { messages: this.extractRestoreMessages(history, diffs) },
          });
        }
        break;
      }

      // ---- Config (works with any webview) ----
      case 'config.get': {
        reply({ type: 'config.state', payload: getConfigState() });
        break;
      }

      case 'config.set': {
        const { provider, chatModel, completionModel, baseURL, apiKey } = (message as any).payload || {};
        const cfg = vscode.workspace.getConfiguration('aiCodingAgent');
        if (provider) await cfg.update('provider', provider, vscode.ConfigurationTarget.Global);
        if (chatModel) await cfg.update('chatModel', chatModel, vscode.ConfigurationTarget.Global);
        if (completionModel !== undefined) await cfg.update('completionModel', completionModel, vscode.ConfigurationTarget.Global);
        if (baseURL !== undefined) await cfg.update('baseURL', baseURL, vscode.ConfigurationTarget.Global);
        setTimeout(() => reply({ type: 'config.state', payload: getConfigState() }), 500);
        break;
      }

      case 'config.scan': {
        const found = await scanKnownLocations();
        reply({
          type: 'config.found',
          payload: {
            configs: found.map((f) => ({
              source: f.source,
              sourcePath: f.sourcePath,
              provider: f.provider,
              chatModel: f.chatModel,
              baseURL: f.baseURL,
              hasApiKey: !!f.apiKey,
            })),
          },
        });
        break;
      }

      case 'config.import': {
        if (this.onImportRequest) {
          await this.onImportRequest();
          setTimeout(() => reply({ type: 'config.state', payload: getConfigState() }), 500);
        }
        break;
      }

      case 'config.importSpecific': {
        const { sourcePath } = message.payload;
        // Try cached import first (has API key)
        if (this.onImportCached) {
          await this.onImportCached(sourcePath);
        } else if (message.payload.apiKey && this.onImportRequest) {
          // Fallback: use interactive import
          await this.onImportRequest();
        }
        logInfo(`Config imported: ${sourcePath}`);
        setTimeout(() => reply({ type: 'config.state', payload: getConfigState() }), 500);
        break;
      }

      case 'config.manualSetup': {
        this.onManualSetup?.();
        break;
      }

      // ---- Tools (requires panel for approval dialog) ----
      case 'tool.approve': {
        const resolver = this.pendingApprovalResolver.get(message.payload.toolCallId);
        if (resolver) {
          this.pendingApprovalResolver.delete(message.payload.toolCallId);
          resolver.resolve(true);
        }
        break;
      }

      case 'tool.reject': {
        const resolver = this.pendingApprovalResolver.get(message.payload.toolCallId);
        if (resolver) {
          this.pendingApprovalResolver.delete(message.payload.toolCallId);
          resolver.resolve(false);
        }
        break;
      }

      // ---- Sessions ----
      case 'session.list': {
        const ws = this.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        const sessions = listSessions(ws);
        reply({ type: 'session.list', payload: { sessions } });
        break;
      }

      case 'session.create': {
        const ws = this.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        const s = createSessionFile(ws);
        this.activeSessionId = s.id;
        this.chatEngine?.clearHistory();
        this.onSessionSwitch?.(s.id);
        reply({ type: 'chat.clear' });
        // Send updated session list
        const updated = listSessions(ws);
        reply({ type: 'session.list', payload: { sessions: updated } });
        break;
      }

      case 'session.switch': {
        const targetId = message.payload?.sessionId;
        if (targetId) {
          const ws = this.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
          this.activeSessionId = targetId;
          this.onSessionSwitch?.(targetId);
          const msgs = loadSessionMessages(ws, targetId);
          const diffs = loadSessionDiffs(ws, targetId);
          reply({
            type: 'chat.state',
            payload: {
              messages: this.extractRestoreMessages(msgs, diffs),
            },
          });
        }
        break;
      }

      case 'session.delete': {
        const delId = message.payload?.sessionId;
        if (delId) {
          const ws = this.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
          deleteSessionFile(ws, delId);
          if (this.activeSessionId === delId) {
            const remaining = listSessions(ws);
            this.activeSessionId = remaining[0]?.id || null;
            if (this.activeSessionId && this.onSessionSwitch) {
              this.onSessionSwitch(this.activeSessionId);
            } else {
              this.chatEngine?.clearHistory();
              reply({ type: 'chat.clear' });
            }
          }
          reply({ type: 'session.list', payload: { sessions: listSessions(ws) } });
        }
        break;
      }

      case 'context.refresh':
        break;

      default:
        logInfo(`Unhandled message type: ${(message as any).type}`);
    }
  }

  /**
   * Extract human-readable messages with tool calls from AI SDK CoreMessage history.
   * Used by both chat.restore (in-memory) and session.switch (disk-loaded).
   */
  private extractRestoreMessages(
    history: CoreMessage[],
    diffs?: Map<string, import('../types/diff').UnifiedDiff>,
  ): Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    toolCalls?: Array<{
      id: string;
      name: string;
      displayName: string;
      args: Record<string, unknown>;
      result?: string;
      success?: boolean;
      status: 'done' | 'error';
      diff?: import('../types/diff').UnifiedDiff;
    }>;
  }> {
    // Collect tool results by toolCallId (from tool-role messages)
    const toolResults = new Map<string, { result: string; success: boolean }>();
    for (const m of history) {
      if (m.role === 'tool' && Array.isArray(m.content)) {
        for (const p of m.content as any[]) {
          if (p.type === 'tool-result' && p.toolCallId) {
            toolResults.set(p.toolCallId, {
              result: typeof p.result === 'string' ? p.result : JSON.stringify(p.result ?? ''),
              success: !(p as any).isError,
            });
          }
        }
      }
    }

    const messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
      toolCalls?: Array<{
        id: string;
        name: string;
        displayName: string;
        args: Record<string, unknown>;
        result?: string;
        success?: boolean;
        status: 'done' | 'error';
        diff?: import('../types/diff').UnifiedDiff;
      }>;
    }> = [];

    for (let i = 0; i < history.length; i++) {
      const m = history[i];
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      if (!m.content) continue;

      let text = '';
      const toolCalls: Array<{
        id: string;
        name: string;
        displayName: string;
        args: Record<string, unknown>;
        result?: string;
        success?: boolean;
        status: 'done' | 'error';
        diff?: import('../types/diff').UnifiedDiff;
      }> = [];

      if (typeof m.content === 'string') {
        text = m.content;
      } else if (Array.isArray(m.content)) {
        for (const p of m.content as any[]) {
          if (p.type === 'text' && p.text) {
            text += (text ? '\n' : '') + p.text;
          } else if (p.type === 'tool-call' && p.toolCallId) {
            const tr = toolResults.get(p.toolCallId);
            toolCalls.push({
              id: p.toolCallId,
              name: p.toolName,
              displayName: this.toolRegistry.getDisplayName(p.toolName) || p.toolName,
              args: (p.args || {}) as Record<string, unknown>,
              result: tr?.result,
              success: tr?.success,
              status: tr ? ('done' as const) : ('error' as const),
              diff: diffs?.get(p.toolCallId),
            });
          }
        }
      }

      if (!text.trim() && toolCalls.length === 0) continue;

      messages.push({
        id: `rest_${i}`,
        role: m.role as 'user' | 'assistant',
        content: text,
        timestamp: Date.now() - (history.length - i) * 1000,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }

    return messages;
  }

  dispose(): void {
    this.chatEngine?.cancel();
    this.pendingApprovalResolver.clear();
    vscode.Disposable.from(...this.disposables).dispose();
  }
}
