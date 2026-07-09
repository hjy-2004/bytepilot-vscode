import { tool } from 'ai';
import { z } from 'zod';
import type { RegisteredTool, ToolExecutionContext, PermissionLevel } from '../types/tools';
import type { ToolDef } from '../types/tools';
import type { UnifiedDiff } from '../types/diff';
import { logInfo, logError } from '../platform/logger';
import { logToolCallStart, logToolCallResult } from '../utils/ai-logger';

/**
 * Build a complete registered tool from a definition, filling in defaults.
 * Follows Claude Code's buildTool pattern but simplified for our use case.
 */
export function buildTool(def: ToolDef): RegisteredTool {
  return {
    ...def,
    isConcurrencySafe: def.isConcurrencySafe ?? (() => false),
    isReadOnly: def.isReadOnly ?? (() => def.permissionLevel === 'read'),
    maxResultChars: def.maxResultChars ?? 8000,
    getPromptDescription(): string {
      return `- **${def.name}**: ${def.description}`;
    },
  };
}

/**
 * Central registry for all AI-accessible tools.
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private executionContext: ToolExecutionContext | null = null;
  private lastDiffData: UnifiedDiff | undefined;
  private pendingApprovalFn: ((toolName: string, displayName: string, args: Record<string, unknown>) => Promise<boolean>) | null = null;

  register(t: RegisteredTool): void {
    if (this.tools.has(t.name)) throw new Error(`Tool "${t.name}" already registered.`);
    this.tools.set(t.name, t);
    logInfo(`Tool registered: ${t.name} (${t.permissionLevel})`);
  }

  registerAll(tools: ToolDef[]): void {
    for (const t of tools) {
      this.register(buildTool(t));
    }
  }

  /** Returns tools in AI SDK format for providers that support native tool calling */
  getAISDKTools(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, t] of this.tools) {
      result[name] = tool({
        description: t.description,
        parameters: t.inputSchema as unknown as any,
        execute: async (args: any) => {
          logInfo(`[Execute] ${t.name}: START — pendingApprovalFn=${!!this.pendingApprovalFn}`);
          if (!this.executionContext) throw new Error('Tool context not set');
          const execCtx: ToolExecutionContext = {
            ...this.executionContext,
            onDiff: (diff: UnifiedDiff) => { this.lastDiffData = diff; },
          };

          // Check approval for write tools - blocks until user responds
          if (!t.isReadOnly() && this.pendingApprovalFn) {
            logInfo(`[Approval] Requesting approval for ${t.name} — blocking...`);
            const approved = await this.pendingApprovalFn(t.name, t.displayName, args as Record<string, unknown>);
            logInfo(`[Approval] Result for ${t.name}: ${approved ? 'approved' : 'rejected'}`);
            if (!approved) return 'Error: Tool execution was rejected by user.';
          }

          const startTime = Date.now();
          logToolCallStart({
            toolCallId: t.name,
            toolName: t.name,
            displayName: t.displayName,
            args: args as Record<string, unknown>,
          });
          try {
            const result = await t.call(args, execCtx);
            logToolCallResult(t.name, t.name, true, result, Date.now() - startTime);
            return result;
          } catch (err: any) {
            logToolCallResult(t.name, t.name, false, err.message || 'Unknown error', Date.now() - startTime);
            throw err;
          }
        },
      });
    }
    return result;
  }

  /** Returns text-based tool descriptions for the system prompt */
  getSystemPromptTools(): string {
    return Array.from(this.tools.values())
      .map(t => t.getPromptDescription())
      .join('\n');
  }

  setExecutionContext(ctx: ToolExecutionContext): void {
    this.executionContext = ctx;
  }

  getExecutionContext(): ToolExecutionContext | null {
    return this.executionContext;
  }

  async execute(name: string, args: unknown): Promise<string> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Tool "${name}" not found`);
    if (!this.executionContext) throw new Error('Tool context not set');
    try {
      const execCtx: ToolExecutionContext = {
        ...this.executionContext,
        onDiff: (diff: UnifiedDiff) => { this.lastDiffData = diff; },
      };
      return await t.call(args, execCtx);
    } catch (err: any) {
      logError(`Tool ${name} failed`, err);
      return `Error: ${err?.message || err}`;
    }
  }

  getPermissionLevel(name: string): PermissionLevel | undefined {
    return this.tools.get(name)?.permissionLevel;
  }

  getDisplayName(name: string): string | undefined {
    return this.tools.get(name)?.displayName;
  }

  /** Set approval function for write tools. Called before each tool execution. */
  setApprovalFn(fn: ((toolName: string, displayName: string, args: Record<string, unknown>) => Promise<boolean>) | null): void {
    this.pendingApprovalFn = fn;
  }

  /** Consume diff data stashed by the last tool execution. Call once after each tool-result. */
  consumeLastDiff(): UnifiedDiff | undefined {
    const d = this.lastDiffData;
    this.lastDiffData = undefined;
    return d;
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }
}
