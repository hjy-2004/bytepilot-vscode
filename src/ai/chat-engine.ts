import type { LanguageModelV1 } from 'ai';
import { ToolRegistry } from '../tools/registry';
import { StreamBridge } from './stream-bridge';
import { logInfo, logError } from '../utils/logger';
import { saveFullHistory } from '../chat/history';
import { runAgentLoop, type AgentCallbacks } from './agent-loop';
import type { ApiConfig, ToolDef } from './api-client';
import type { Message, Attachment } from './message-types';

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
- Follow the project's existing code style.
- **If the user denies a tool you call, do not re-attempt the exact same tool call. Instead, think about why the user has denied the tool call and adjust your approach.**`;

/**
 * Core chat engine that manages AI conversations with tool calling.
 *
 * Uses streamText() for per-token streaming output, with multi-step
 * tool calling (maxSteps: 15) handled automatically by the AI SDK.
 */
export class ChatEngine {
  private history: Message[] = [];
  private abortController: AbortController | null = null;
  private streamBridge: StreamBridge;
  private workspacePath: string = '';
  private isGenerating: boolean = false;
  private lastStreamText: string = '';
  private lastToolCalls: Array<{ id: string; name: string; displayName: string; args: Record<string, unknown> }> = [];
  private lastToolResults: Array<{ id: string; name: string; result: string; success: boolean }> = [];
  private toolDiffs: Map<string, import('../types/diff').UnifiedDiff> = new Map();
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly provider: string;

  constructor(
    private readonly chatModel: LanguageModelV1,
    private readonly toolRegistry: ToolRegistry,
    private readonly getSystemContext?: () => Promise<string>,
    provider?: string,
    baseURL?: string,
    apiKey?: string,
  ) {
    this.baseURL = baseURL || '';
    this.apiKey = apiKey || '';
    this.provider = provider || 'anthropic';
    this.streamBridge = new StreamBridge();
  }

  private getSessionId?: () => string;

  setWorkspacePath(wsPath: string): void { this.workspacePath = wsPath; }
  setSessionIdProvider(fn: () => string): void { this.getSessionId = fn; }

  onStreamEvent(callback: (msg: import('../types/ipc').ExtensionMessage) => void): void {
    this.streamBridge.setCallback(callback);
  }

  async sendMessage(
    userContent: string,
    onApproval?: (toolCallId: string, toolName: string, displayName: string, args: Record<string, unknown>) => Promise<boolean>,
    attachments?: Attachment[],
  ): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.isGenerating = true;
    this.lastStreamText = '';
    this.lastToolCalls = [];
    this.lastToolResults = [];
    this.history.push({ role: 'user', content: userContent, attachments });

    try {
      await this.runLoop(onApproval);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.streamBridge.sendError('Request cancelled.');
      } else {
        logError('Chat engine error', err);
        this.streamBridge.sendError(err.message || 'An unknown error occurred.');
      }
      throw err;
    }
  }

  private async runLoop(onApproval?: AgentCallbacks['onApprovalNeeded']): Promise<void> {
    const sysCtx = this.getSystemContext ? await this.getSystemContext() : '';
    const toolDescs = this.toolRegistry.getSystemPromptTools();
    const base = SYSTEM_PROMPT.replace('__TOOLS_PLACEHOLDER__', toolDescs);
    const sysInfo = `\n\n## System Info\n- OS: ${process.platform} (${process.platform === 'win32' ? 'use cmd /c, del, rmdir; not rm, rm -rf, mkdir' : 'use standard Unix commands'})`;
    const systemPrompt = sysCtx ? `${base}${sysInfo}\n\n## Current Workspace Context\n${sysCtx}` : `${base}${sysInfo}`;

    const tools = this.toolRegistry.list();
    const toolDefs: ToolDef[] = tools.map((t) => {
      const p: Record<string, unknown> = { type: 'object', properties: {}, required: [] };
      try {
        const shape = (t.inputSchema as any)?._def?.shape?.() || {};
        for (const [k, s] of Object.entries(shape)) {
          const tn = (s as any)?._def?.typeName || 'ZodString';
          const tmap: Record<string, string> = { ZodString: 'string', ZodNumber: 'number', ZodBoolean: 'boolean' };
          (p.properties as any)[k] = { type: tmap[tn as string] || 'string', description: (s as any)?._def?.description || '' };
          if (tn !== 'ZodOptional') (p.required as string[]).push(k);
        }
      } catch {}
      return { name: t.name, description: t.description, parameters: p };
    });

    const cfg: ApiConfig = {
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      model: ((this.chatModel as any).modelId || 'unknown').replace(/\[.*\]$/, ''), // strip thinking budget suffix
      maxTokens: 4096,
      provider: this.provider,
    };

    const cb: AgentCallbacks = {
      onToken: (text) => { this.lastStreamText += text; this.streamBridge.sendToken(text); },
      onToolCall: (id, name, dn, args, needsApproval) => {
        this.lastToolCalls.push({ id, name, displayName: dn, args });
        this.streamBridge.sendToolCall(id, name, dn, args, needsApproval);
      },
      onApprovalNeeded: onApproval || (async () => true),
      onToolResult: (id, name, result, success) => {
        const diff = this.toolRegistry.consumeLastDiff();
        if (diff) this.toolDiffs.set(id, diff);
        this.lastToolResults.push({ id, name, result, success });
        this.streamBridge.sendToolResult(id, name, result, success, diff);
      },
      getDisplayName: (name) => this.toolRegistry.getDisplayName(name) || name,
      executeTool: async (name, args) => {
        try {
          const r = await this.toolRegistry.execute(name, args);
          return { result: r, success: !r.startsWith('Error') };
        } catch (e: any) { return { result: `Error: ${e.message}`, success: false }; }
      },
      isReadOnly: (name) => { const t = this.toolRegistry.get(name); return t?.isReadOnly() ?? false; },
    };

    // Clean up old-format tool messages that might lack toolCallId
    this.history = this.history.filter(m => m.role !== 'tool' || m.toolCallId);
    const maxSteps = parseInt(process.env.AI_CODING_MAX_STEPS || '500', 10) || 500;
    await runAgentLoop(cfg, this.history, systemPrompt, toolDefs, cb, maxSteps, this.abortController!.signal);

    if (this.workspacePath && this.getSessionId) {
      saveFullHistory(this.workspacePath, this.getSessionId(), this.history as any, this.toolDiffs);
      this.toolDiffs.clear();
    }
    this.isGenerating = false;
    this.streamBridge.sendDone();
  }

  clearHistory(): void { this.history = []; }
  cancel(): void { this.streamBridge.cancel(); this.abortController?.abort(); }
  getHistory() { return [...this.history]; }
  setHistory(h: any[]) { this.history = h as Message[]; }
  getIsGenerating(): boolean { return this.isGenerating; }
  getToolDiffs() { return this.toolDiffs; }
  reconnectStream(cb: (msg: import('../types/ipc').ExtensionMessage) => void): void {
    this.streamBridge.setCallback(cb);
    if (this.lastStreamText) cb({ type: 'chat.token', payload: { text: this.lastStreamText } });
  }
}
