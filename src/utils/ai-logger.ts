import * as vscode from 'vscode';
import { logInfo } from './logger';

// ============================================================
// Structured AI interaction logger
// Logs all AI communication, tool calls, and API parameters
// to the "BytePilot" output channel.
// ============================================================

let channel: vscode.OutputChannel | null = null;
let devMode = false;

/** Set to true during activation if running in development (F5 debug) mode. */
export function setDevMode(dev: boolean): void {
  devMode = dev;
}

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('BytePilot', { log: true });
  }
  return channel;
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
  const ch = getChannel();
  if (devMode) ch.show(true);
  ch.appendLine(`\n${'═'.repeat(60)}`);
  ch.appendLine(`[${ts()}] 🤖 AI REQUEST START`);
  ch.appendLine(`  Provider  : ${req.provider}`);
  ch.appendLine(`  Model     : ${req.model}`);
  if (req.baseURL) ch.appendLine(`  BaseURL   : ${req.baseURL}`);
  ch.appendLine(`  Params    : temperature=${req.temperature} maxTokens=${req.maxTokens} maxSteps=${req.maxSteps}`);
  ch.appendLine(`  Context   : ${req.messageCount} messages, ${req.systemPromptLength} chars system prompt`);
  ch.appendLine(`  Tools     : ${req.toolCount} tools → [${req.toolNames.join(', ')}]`);
  ch.appendLine(`${'─'.repeat(60)}`);
}

export function logAiFirstToken(ms: number): void {
  const ch = getChannel();
  ch.appendLine(`[${ts()}] ⚡ First token after ${ms}ms`);
}

export function logAiStreamProgress(tokenCount: number): void {
  // Only log every 50 tokens to avoid spam
  getChannel();
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
  const ch = getChannel();
  ch.appendLine(`[${ts()}] ✅ AI REQUEST COMPLETE`);
  ch.appendLine(`  Duration  : ${usage.durationMs}ms`);
  if (usage.inputTokens !== undefined) {
    ch.appendLine(`  Tokens    : ${usage.inputTokens} in / ${usage.outputTokens} out / ${(usage.inputTokens + (usage.outputTokens || 0))} total`);
  }
  ch.appendLine(`${'─'.repeat(60)}`);
}

export function logAiError(error: string, code?: string): void {
  const ch = getChannel();
  if (devMode) ch.show(true);
  ch.appendLine(`[${ts()}] ❌ AI REQUEST ERROR`);
  if (code) ch.appendLine(`  Code      : ${code}`);
  ch.appendLine(`  Message   : ${error}`);
  ch.appendLine(`${'─'.repeat(60)}`);
}

// ---- Tool Call Logging ----

export interface ToolCallLog {
  toolCallId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
}

export function logToolCallStart(tc: ToolCallLog): void {
  const ch = getChannel();
  if (devMode) ch.show(true);
  ch.appendLine(`[${ts()}] 🔧 TOOL CALL`);
  ch.appendLine(`  ID        : ${tc.toolCallId}`);
  ch.appendLine(`  Tool      : ${tc.displayName || tc.toolName}`);
  ch.appendLine(`  Args      :\n${indent(fmt(tc.args), 4)}`);
}

export function logToolCallResult(
  toolCallId: string,
  toolName: string,
  success: boolean,
  result: string,
  durationMs: number,
): void {
  const ch = getChannel();
  const status = success ? '✅' : '❌';
  const preview = result.length > 300 ? result.substring(0, 300) + '...(truncated)' : result;
  ch.appendLine(`[${ts()}] ${status} TOOL RESULT [${toolName}] (${durationMs}ms)`);
  ch.appendLine(`  ID        : ${toolCallId}`);
  ch.appendLine(`  Result    :\n${indent(preview, 4)}`);
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
  const ch = getChannel();
  ch.appendLine(`\n${'─'.repeat(50)}`);
  ch.appendLine(`[${ts()}] 📝 COMPLETION REQUEST`);
  ch.appendLine(`  Provider  : ${req.provider}`);
  ch.appendLine(`  Model     : ${req.model}`);
  if (req.baseURL) ch.appendLine(`  BaseURL   : ${req.baseURL}`);
  ch.appendLine(`  Params    : maxTokens=${req.maxTokens} temperature=${req.temperature}`);
  ch.appendLine(`  Context   : prefix=${req.promptLength} chars, suffix=${req.suffixLength} chars`);
  ch.appendLine(`${'─'.repeat(50)}`);
}

export function logCompletionResult(model: string, outputLength: number, durationMs: number): void {
  const ch = getChannel();
  ch.appendLine(`[${ts()}] 📝 COMPLETION DONE [${model}] → ${outputLength} chars, ${durationMs}ms`);
}

// ---- Provider Config Logging ----

export function logProviderConfig(provider: string, chatModel: string, completionModel: string, baseURL?: string): void {
  const ch = getChannel();
  ch.appendLine(`\n[${ts()}] ⚙️ PROVIDER CONFIGURED`);
  ch.appendLine(`  Provider  : ${provider}`);
  ch.appendLine(`  Chat      : ${chatModel}`);
  ch.appendLine(`  Completion: ${completionModel || '(same as chat)'}`);
  if (baseURL) ch.appendLine(`  BaseURL   : ${baseURL}`);
}

// ---- Utility ----

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(l => prefix + l).join('\n');
}
