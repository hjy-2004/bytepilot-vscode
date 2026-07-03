import { logInfo, getCoreLogger } from '../platform/logger';

// ============================================================
// Structured AI interaction logger
// Logs all AI communication, tool calls, and API parameters
// to the shared "BytePilot" output channel with colored output.
// ============================================================

let devMode = false;

/** Set to true during activation if running in development (F5 debug) mode. */
export function setDevMode(dev: boolean): void {
  devMode = dev;
}

function ch() {
  const c = getCoreLogger();
  if (devMode) c.show(true);
  return c;
}

function ts(): string {
  return new Date().toISOString();
}

function fmt(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function separator(char = '─', len = 60): string {
  return char.repeat(len);
}

// ---- AI Request Logging ----

export interface AiRequestLog {
  provider: string;
  model: string;
  baseURL?: string;
  temperature: number;
  maxTokens: number;
  maxSteps: number;
  systemPromptLength: number;
  messageCount: number;
  toolCount: number;
  toolNames: string[];
}

export function logAiRequestStart(req: AiRequestLog): void {
  const c = ch();
  c.info(`\n${separator('═')}`);
  c.info(`[${ts()}] 🤖 AI REQUEST START`);
  c.info(`  Provider  : ${req.provider}`);
  c.info(`  Model     : ${req.model}`);
  if (req.baseURL) c.info(`  BaseURL   : ${req.baseURL}`);
  c.info(`  Params    : temperature=${req.temperature} maxTokens=${req.maxTokens} maxSteps=${req.maxSteps}`);
  c.info(`  Context   : ${req.messageCount} messages, ${req.systemPromptLength} chars system prompt`);
  c.info(`  Tools     : ${req.toolCount} tools → [${req.toolNames.join(', ')}]`);
  c.info(`${separator()}`);
}

export function logAiFirstToken(ms: number): void {
  const c = ch();
  c.info(`[${ts()}] ⚡ First token after ${ms}ms`);
}

export function logAiStreamProgress(tokenCount: number): void {
  if (tokenCount % 50 === 0 && tokenCount > 0) {
    logInfo(`[AI] streaming... ${tokenCount} tokens received`);
  }
}

export function logAiCompletion(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs: number;
}): void {
  const c = ch();
  c.info(`[${ts()}] ✅ AI REQUEST COMPLETE`);
  c.info(`  Duration  : ${usage.durationMs}ms`);
  if (usage.inputTokens !== undefined) {
    c.info(`  Tokens    : ${usage.inputTokens} in / ${usage.outputTokens} out / ${(usage.inputTokens + (usage.outputTokens || 0))} total`);
  }
  c.info(`${separator()}`);
}

export function logAiError(error: string, code?: string): void {
  const c = ch();
  c.show(true); // Always show on error
  c.error(`[${ts()}] ❌ AI REQUEST ERROR`);
  if (code) c.error(`  Code      : ${code}`);
  c.error(`  Message   : ${error}`);
  c.error(`${separator()}`);
}

// ---- Tool Call Logging ----

export interface ToolCallLog {
  toolCallId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
}

export function logToolCallStart(tc: ToolCallLog): void {
  const c = ch();
  c.info(`[${ts()}] 🔧 TOOL CALL`);
  c.info(`  ID        : ${tc.toolCallId}`);
  c.info(`  Tool      : ${tc.displayName || tc.toolName}`);
  c.info(`  Args      :\n${indent(fmt(tc.args), 4)}`);
}

export function logToolCallResult(
  toolCallId: string,
  toolName: string,
  success: boolean,
  result: string,
  durationMs: number,
): void {
  const c = ch();
  const preview = result.length > 300 ? result.substring(0, 300) + '...(truncated)' : result;
  if (success) {
    c.info(`[${ts()}] ✅ TOOL RESULT [${toolName}] (${durationMs}ms)`);
    c.info(`  ID        : ${toolCallId}`);
    c.debug(`  Result    :\n${indent(preview, 4)}`);
  } else {
    c.warn(`[${ts()}] ❌ TOOL RESULT [${toolName}] (${durationMs}ms)`);
    c.warn(`  ID        : ${toolCallId}`);
    c.warn(`  Result    :\n${indent(preview, 4)}`);
  }
}

// ---- Completion (FIM) Logging ----

export interface CompletionLog {
  provider: string;
  model: string;
  baseURL?: string;
  promptLength: number;
  suffixLength: number;
  maxTokens: number;
  temperature: number;
}

export function logCompletionRequest(req: CompletionLog): void {
  const c = ch();
  c.info(`\n${separator('─', 50)}`);
  c.info(`[${ts()}] 📝 COMPLETION REQUEST`);
  c.info(`  Provider  : ${req.provider}`);
  c.info(`  Model     : ${req.model}`);
  if (req.baseURL) c.info(`  BaseURL   : ${req.baseURL}`);
  c.info(`  Params    : maxTokens=${req.maxTokens} temperature=${req.temperature}`);
  c.info(`  Context   : prefix=${req.promptLength} chars, suffix=${req.suffixLength} chars`);
  c.info(`${separator('─', 50)}`);
}

export function logCompletionResult(model: string, outputLength: number, durationMs: number): void {
  const c = ch();
  c.info(`[${ts()}] 📝 COMPLETION DONE [${model}] → ${outputLength} chars, ${durationMs}ms`);
}

// ---- Provider Config Logging ----

export function logProviderConfig(provider: string, chatModel: string, completionModel: string, baseURL?: string): void {
  const c = ch();
  c.info(`\n[${ts()}] ⚙️ PROVIDER CONFIGURED`);
  c.info(`  Provider  : ${provider}`);
  c.info(`  Chat      : ${chatModel}`);
  c.info(`  Completion: ${completionModel || '(same as chat)'}`);
  if (baseURL) c.info(`  BaseURL   : ${baseURL}`);
}

// ---- Utility ----

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(l => prefix + l).join('\n');
}
