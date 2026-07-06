import type { LanguageModelV1 } from 'ai';
import { ToolRegistry } from '../tools/registry';
import { StreamBridge } from './stream-bridge';
import { logInfo, logError } from '../utils/logger';
import { saveFullHistory, appendMessage } from '../chat/history';
import { runAgentLoop, type AgentCallbacks } from './agent-loop';
import { estimateTokens, trimContextToBudget } from '../utils/token-counter';
import type { IConfigStore } from '@bytepilot/core';
import type { ApiConfig, ToolDef } from './api-client';
import type { Message, Attachment } from './message-types';

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into VS Code. You help developers write, understand, and debug code.

## Available Tools
You have access to these tools. When tools are available as native function calls, use them. Otherwise, describe what tool you would use and I will execute it.

__TOOLS_PLACEHOLDER__

## Doing tasks
- The user will primarily request you to perform software engineering tasks. These may include solving bugs, adding new functionality, refactoring code, explaining code, and more. When given an unclear or generic instruction, consider it in the context of these software engineering tasks and the current working directory.
- In general, do not propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Do not create files unless they're absolutely necessary for achieving your goal. Generally prefer editing an existing file to creating a new one.
- Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees.
- Don't create helpers, utilities, or abstractions for one-time operations. Three similar lines of code is better than a premature abstraction.
- If an approach fails, diagnose why before switching tactics — don't retry the identical action blindly.
- When given a simple question (e.g., "what is this project", "explain this code"), answer directly without using tools unless absolutely necessary.

## Executing actions with care
- Carefully consider the reversibility and blast radius of actions. For write operations (edit_file, write_file, execute_command), the system will ask for your approval before executing. Only propose writes when the user's request clearly requires them.
- If the user denies a tool you call, do not re-attempt the exact same tool call. Instead, think about why the user has denied the tool call and adjust your approach.

## File editing guidelines
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
    private readonly config: IConfigStore,
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
    } finally {
      this.isGenerating = false;
      this.abortController = null;
      this.streamBridge.sendDone();
    }
  }

  private async runLoop(onApproval?: AgentCallbacks['onApprovalNeeded']): Promise<void> {
    const sysCtx = this.getSystemContext ? await this.getSystemContext() : '';
    const toolDescs = this.toolRegistry.getSystemPromptTools();
    const base = SYSTEM_PROMPT.replace('__TOOLS_PLACEHOLDER__', toolDescs);
    const sysInfo = `\n\n## System Info\n- OS: ${process.platform} (${process.platform === 'win32' ? 'use cmd /c, del, rmdir; not rm, rm -rf, mkdir' : 'use standard Unix commands'})`;
    let contextPart = '';
    if (sysCtx) {
      const contextLimit = this.config.get<number>('contextLength', 128000);
      // Reserve ~70% of context for conversation; allow ~30% for system + context
      const maxCtxTokens = Math.floor(contextLimit * 0.3);
      const { trimmed, estimatedTokens, wasTrimmed } = trimContextToBudget(sysCtx, maxCtxTokens);
      contextPart = `\n\n## Current Workspace Context\n${trimmed}`;
      if (wasTrimmed) {
        logInfo(`[ChatEngine] Context trimmed: ~${estimatedTokens} tokens (budget: ${maxCtxTokens})`);
      }
    }
    const systemPrompt = `${base}${sysInfo}${contextPart}`;
    const estimatedSysTokens = estimateTokens(systemPrompt, false);
    logInfo(`[ChatEngine] System prompt: ~${estimatedSysTokens} tokens`);

    // Zod internal shape extraction types
    interface ZodFieldDef {
      _def: { typeName: string; description?: string };
    }
    interface ZodSchemaDef {
      _def: { shape?: () => Record<string, ZodFieldDef> };
    }

    const tools = this.toolRegistry.list();
    const tmap: Record<string, string> = { ZodString: 'string', ZodNumber: 'number', ZodBoolean: 'boolean' };
    const toolDefs: ToolDef[] = tools.map((t) => {
      const p: Record<string, unknown> = { type: 'object', properties: {}, required: [] };
      try {
        const schema = t.inputSchema as unknown as ZodSchemaDef;
        const shape = schema._def?.shape?.() || {};
        for (const [k, s] of Object.entries(shape)) {
          const tn = s?._def?.typeName || 'ZodString';
          (p.properties as Record<string, unknown>)[k] = {
            type: tmap[tn] || 'string',
            description: s?._def?.description || '',
          };
          if (tn !== 'ZodOptional') (p.required as string[]).push(k);
        }
      } catch { /* skip non-Zod or malformed schemas */ }
      return { name: t.name, description: t.description, parameters: p };
    });

    // Extract model ID from the AI SDK LanguageModelV1 instance
    const modelId: string = (this.chatModel as { modelId?: string }).modelId || 'unknown';
    const cfg: ApiConfig = {
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      model: modelId.replace(/\[.*\]$/, ''), // strip thinking budget suffix
      maxTokens: this.config.get<number>('maxTokens', 4096),
      thinkingBudget: this.config.get<number>('thinkingBudget', 4096),
      provider: this.provider,
    };

    const cb: AgentCallbacks = {
      onStarted: () => { this.streamBridge.sendStarted(); },
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
      onHistoryChanged: () => {
        if (!this.workspacePath || !this.getSessionId) return;
        const sid = this.getSessionId();
        if (!sid) return;
        // Incrementally persist the full message (including toolCallId/toolCalls) to JSONL
        const lastMsg = this.history[this.history.length - 1];
        if (lastMsg) {
          appendMessage(this.workspacePath, sid, lastMsg);
        }
      },
    };

    // Clean up old-format tool messages that might lack toolCallId
    this.history = this.history.filter(m => m.role !== 'tool' || m.toolCallId);
    const maxSteps = parseInt(process.env.AI_CODING_MAX_STEPS || '500', 10) || 500;
    await runAgentLoop(cfg, this.history, systemPrompt, toolDefs, cb, maxSteps, this.abortController!.signal);

    if (this.workspacePath && this.getSessionId) {
      saveFullHistory(this.workspacePath, this.getSessionId(), this.history as any, this.toolDiffs);
      this.toolDiffs.clear();
    }
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
