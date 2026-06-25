import type { Message } from './message-types';
import type { ApiConfig, ToolDef, StreamResult } from './api-client';
import { streamChat } from './api-client';
import { logInfo, logError } from '../utils/logger';
import { logAiRequestStart, logAiCompletion, logAiError, logToolCallStart, logToolCallResult } from '../utils/ai-logger';

export interface AgentCallbacks {
  onToken: (text: string) => void;
  onToolCall: (id: string, name: string, displayName: string, args: Record<string, unknown>, needsApproval?: boolean) => void;
  onApprovalNeeded: (id: string, name: string, displayName: string, args: Record<string, unknown>) => Promise<boolean>;
  onToolResult: (id: string, name: string, result: string, success: boolean) => void;
  getDisplayName: (name: string) => string;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<{ result: string; success: boolean }>;
  isReadOnly: (name: string) => boolean;
}

export async function runAgentLoop(
  config: ApiConfig,
  history: Message[],
  systemPrompt: string,
  toolDefs: ToolDef[],
  cb: AgentCallbacks,
  maxSteps: number,
  signal?: AbortSignal,
): Promise<void> {
  const startTime = Date.now();
  const sm: Message = { role: 'system', content: systemPrompt };

  logAiRequestStart({
    provider: config.provider || 'anthropic',
    model: config.model,
    baseURL: config.baseURL,
    temperature: 0,
    maxTokens: config.maxTokens || 4096,
    maxSteps,
    systemPromptLength: systemPrompt.length,
    messageCount: history.length,
    toolCount: toolDefs.length,
    toolNames: toolDefs.map((t) => t.name),
  });

  let totalIn = 0, totalOut = 0;
  let step = 0;

  try {
    while (step < maxSteps) {
      step++;
      if (signal?.aborted) break;
      const allMessages: Message[] = [sm, ...history];
      logInfo(`[AgentLoop] Step ${step} — ${history.length} msgs`);

      const result = await streamChat(config, allMessages, toolDefs, cb.onToken, signal);
      if (result.usage) { totalIn += result.usage.inputTokens; totalOut += result.usage.outputTokens; }

      const am: Message = { role: 'assistant', content: result.text };
      if (result.toolCalls.length > 0) am.toolCalls = result.toolCalls;
      history.push(am);

      // Don't stop immediately — model may interleave text-only and tool-using responses
      if (result.toolCalls.length === 0) {
        const hasHadTools = history.some(m => m.toolCalls && m.toolCalls.length > 0);
        if (hasHadTools && result.text.length < 500) {
          // Short text after tools → final message, stop
          logInfo(`[AgentLoop] Done — final text (${result.text.length} chars) after tools`);
          break;
        }
        if (!hasHadTools) {
          // No tools ever → simple text conversation, stop
          logInfo(`[AgentLoop] Done — no tools, just text response`);
          break;
        }
        // Has tools before AND long text → model might still be working, continue
        logInfo(`[AgentLoop] Text-only step (${result.text.length} chars) — continuing loop`);
      }

      for (const tc of result.toolCalls) {
        if (signal?.aborted) break;
        const dn = cb.getDisplayName(tc.name) || tc.name;
        cb.onToolCall(tc.id, tc.name, dn, tc.args, !cb.isReadOnly(tc.name));

        let approved = true;
        if (!cb.isReadOnly(tc.name)) {
          cb.onToken(`\n\n---\n⏳ **${dn}** needs your approval — scroll up to the tool card and click Approve or Reject.\n\n`);
          logInfo(`[AgentLoop] BLOCKING for approval of ${tc.name}...`);
          approved = await cb.onApprovalNeeded(tc.id, tc.name, dn, tc.args);
          logInfo(`[AgentLoop] UNBLOCKED: ${tc.name} approved=${approved}`);
          if (approved) {
            cb.onToken(`\n\n✅ **Approved**: ${dn}\n\n`);
          } else {
            cb.onToken(`\n\n❌ **Rejected**: ${dn}\n\n`);
          }
        }

        if (!approved) {
          history.push({ role: 'tool', toolCallId: tc.id, content: 'Error: Tool execution was rejected by user.' });
          cb.onToolResult(tc.id, tc.name, 'Error: Tool execution was rejected by user.', false);
          continue;
        }

        const t0 = Date.now();
        logToolCallStart({ toolCallId: tc.id, toolName: tc.name, displayName: dn, args: tc.args });
        try {
          const r = await cb.executeTool(tc.name, tc.args);
          logToolCallResult(tc.id, tc.name, r.success, r.result, Date.now() - t0);
          history.push({ role: 'tool', toolCallId: tc.id, content: r.result });
          cb.onToolResult(tc.id, tc.name, r.result, r.success);
        } catch (err: any) {
          const msg = `Error: ${err.message}`;
          logToolCallResult(tc.id, tc.name, false, msg, Date.now() - t0);
          history.push({ role: 'tool', toolCallId: tc.id, content: msg });
          cb.onToolResult(tc.id, tc.name, msg, false);
        }
      }
    }

    // Safety cap reached (AI didn't stop on its own)
    if (step >= maxSteps) {
      logInfo(`[AgentLoop] ⚠️ Safety cap (${maxSteps} steps) — task may be incomplete`);
      cb.onToken(`\n\n⚠️ **Stopped at safety limit (${maxSteps} steps).** Task may be incomplete. Send another message to continue.\n\n`);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    logError('Agent loop error', err);
    logAiError(err.message);
    throw err;
  }

  logAiCompletion({ inputTokens: totalIn, outputTokens: totalOut, durationMs: Date.now() - startTime });
}
