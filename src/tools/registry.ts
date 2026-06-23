import { tool } from 'ai';
import { z } from 'zod';
import type { RegisteredTool, ToolExecutionContext, PermissionLevel } from '../types/tools';
import type { ToolDef } from '../types/tools';
import { logInfo, logError } from '../utils/logger';

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
  getAISDKTools(): Record<string, ReturnType<typeof tool>> {
    const result: Record<string, ReturnType<typeof tool>> = {};
    for (const [name, t] of this.tools) {
      result[name] = tool({
        description: t.description,
        parameters: t.inputSchema as z.ZodObject<any>,
        execute: async (args) => {
          if (!this.executionContext) throw new Error('Tool context not set');
          return t.call(args, this.executionContext);
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
      return await t.call(args, this.executionContext);
    } catch (err: any) {
      logError(`Tool ${name} failed`, err);
      return `Error: ${err.message}`;
    }
  }

  getPermissionLevel(name: string): PermissionLevel | undefined {
    return this.tools.get(name)?.permissionLevel;
  }

  getDisplayName(name: string): string | undefined {
    return this.tools.get(name)?.displayName;
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }
}
