import type { Message, ToolCall } from './message-types';

export interface ApiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens?: number;
}

export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── Anthropic Messages API format ──

function toAnthropicMessages(messages: Message[]): unknown[] {
  return messages.filter((m) => m.role !== 'system').map((m) => {
    if (m.role === 'tool') {
      const tid = m.toolCallId || 'unknown';
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: m.content }] };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const content: unknown[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      return { role: 'assistant', content };
    }
    return { role: m.role, content: m.content };
  });
}

export async function streamChat(
  config: ApiConfig,
  messages: Message[],
  tools: ToolDef[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const url = `${config.baseURL}/v1/messages`;
  const systemMsg = messages.find((m) => m.role === 'system');
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    messages: toAnthropicMessages(messages),
    stream: true,
    thinking: { type: 'disabled' },
  };
  if (systemMsg) body['system'] = [{ type: 'text', text: systemMsg.content }];
  if (tools.length > 0) {
    body['tools'] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buf = '', text = '';
  const bmap = new Map<number, { id: string; name: string; args: string }>();
  const calls: ToolCall[] = [];
  let usage: { inputTokens: number; outputTokens: number } | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        try {
          const j = JSON.parse(t.slice(6));
          // text delta
          if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
            text += j.delta.text;
            onToken(j.delta.text);
          }
          // tool args streaming
          if (j.type === 'content_block_delta' && j.delta?.type === 'input_json_delta') {
            const idx = j.index as number;
            if (!bmap.has(idx)) bmap.set(idx, { id: '', name: '', args: '' });
            bmap.get(idx)!.args += j.delta.partial_json;
          }
          // tool use start
          if (j.type === 'content_block_start' && j.content_block?.type === 'tool_use') {
            bmap.set(j.index as number, { id: j.content_block.id, name: j.content_block.name, args: '' });
          }
          // usage
          if (j.type === 'message_delta' && j.usage) {
            usage = { inputTokens: j.usage.input_tokens || 0, outputTokens: j.usage.output_tokens || 0 };
          }
        } catch {}
      }
    }
  } finally { reader.releaseLock(); }

  for (const [, b] of bmap) {
    if (b.name) {
      try { calls.push({ id: b.id, name: b.name, args: JSON.parse(b.args || '{}') }); }
      catch { calls.push({ id: b.id, name: b.name, args: {} }); }
    }
  }
  return { text, toolCalls: calls, usage };
}
