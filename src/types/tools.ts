import type { z } from 'zod';
import type { UnifiedDiff } from './diff';

/** Permission level for tool execution */
export type PermissionLevel = 'read' | 'write' | 'notify';

/** Context passed to tool execution */
export interface ToolExecutionContext {
  workspaceRoot: string;
  signal: AbortSignal;
  onProgress?: (message: string) => void;
  /** If set, tools should call this after making file changes to surface a visual diff in the UI */
  onDiff?: (diff: UnifiedDiff) => void;
}

/** A fully-defined tool, following Claude Code's buildTool pattern */
export interface ToolDef<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = string,
> {
  /** Unique tool name (snake_case convention) */
  readonly name: string;
  /** Display name for UI */
  readonly displayName: string;
  /** One-line description for the AI (3-15 words, no trailing period) */
  readonly description: string;
  /** Permission level */
  readonly permissionLevel: PermissionLevel;
  /** Zod schema for input validation */
  readonly inputSchema: TInput;
  /** Execute the tool */
  call(args: z.infer<TInput>, ctx: ToolExecutionContext): Promise<TOutput>;
  /** Whether this tool is safe to run in parallel */
  isConcurrencySafe(): boolean;
  /** Whether this tool only reads data */
  isReadOnly(): boolean;
  /** Human-readable summary of what was done (for UI) */
  getToolUseSummary?(args: Partial<z.infer<TInput>>): string;
  /** Maximum characters in result before truncation (default 8000) */
  readonly maxResultChars: number;
}

/** Registered tool with metadata */
export interface RegisteredTool extends ToolDef {
  /** Text description for system prompt (when JSON tool calling unavailable) */
  getPromptDescription(): string;
}
