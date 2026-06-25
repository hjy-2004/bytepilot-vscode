import type { Message, ToolCall } from './message-types';

// ── Retry helpers ──

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1s initial backoff

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.ok || !RETRYABLE_STATUSES.has(res.status) || attempt === retries) {
      return res;
    }
    const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 500;
    await new Promise(r => setTimeout(r, delay));
  }
  // Should not reach here, but just in case
  return fetch(url, init);
}

export interface ApiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens?: number;
  thinkingBudget?: number; // budget_tokens for Anthropic extended thinking (0 = disabled)
  provider?: string; // 'anthropic' | 'openai' | 'ollama'
}

export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
  stopReason?: string; // 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── Dispatcher ──

export async function streamChat(
  config: ApiConfig,
  messages: Message[],
  tools: ToolDef[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const provider = config.provider || 'anthropic';
  switch (provider) {
    case 'openai':
      return streamChatOpenAI(config, messages, tools, onToken, signal);
    case 'ollama':
      return streamChatOllama(config, messages, tools, onToken, signal);
    default:
      return streamChatAnthropic(config, messages, tools, onToken, signal);
  }
}

// ── Anthropic Messages API ──

function toAnthropicMessages(messages: Message[]): unknown[] {
  // Filter system messages first
  const filtered = messages.filter((m) => m.role !== 'system');
  const result: unknown[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i];

    if (m.role === 'tool') {
      // Merge consecutive tool_result messages into one user message.
      // Anthropic requires ALL tool_results for a given assistant's tool_uses
      // to be in a SINGLE user message immediately after the assistant message.
      const toolResults: unknown[] = [{ type: 'tool_result', tool_use_id: m.toolCallId || 'unknown', content: m.content }];
      // Collect consecutive tool messages
      while (i + 1 < filtered.length && filtered[i + 1].role === 'tool') {
        i++;
        toolResults.push({ type: 'tool_result', tool_use_id: filtered[i].toolCallId || 'unknown', content: filtered[i].content });
      }
      result.push({ role: 'user', content: toolResults });
      continue;
    }

    if (m.role === 'assistant' && m.toolCalls?.length) {
      const content: unknown[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      result.push({ role: 'assistant', content });
      continue;
    }
    // User message with image attachments → vision content blocks
    if (m.role === 'user' && m.attachments?.length) {
      const content: unknown[] = [];
      for (const att of m.attachments) {
        if (att.type === 'image' && att.content) {
          const b64 = att.content.replace(/^data:image\/\w+;base64,/, '');
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mimeType || 'image/png', data: b64 },
          });
        }
      }
      if (m.content) content.push({ type: 'text', text: m.content });
      result.push({ role: 'user', content });
      continue;
    }
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

async function streamChatAnthropic(
  config: ApiConfig,
  messages: Message[],
  tools: ToolDef[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const url = `${config.baseURL || 'https://api.anthropic.com'}/v1/messages`;
  const systemMsg = messages.find((m) => m.role === 'system');
  const thinkingBudget = config.thinkingBudget ?? 0;
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    messages: toAnthropicMessages(messages),
    stream: true,
  };
  if (thinkingBudget > 0) {
    body['thinking'] = { type: 'enabled', budget_tokens: Math.min(thinkingBudget, (config.maxTokens ?? 4096) - 1024) };
  }
  if (systemMsg) {
    body['system'] = [
      { type: 'text', text: systemMsg.content, cache_control: { type: 'ephemeral' } },
    ];
  }
  if (tools.length > 0) {
    body['tools'] = tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
      // Cache all but the last tool definition to maximize cache reuse
      ...(i < tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
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
  let stopReason: string | undefined;

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
          // Handle thinking blocks (skip — they're internal reasoning, not visible text)
          if (j.type === 'content_block_start' && (j.content_block?.type === 'thinking' || j.content_block?.type === 'redacted_thinking')) continue;
          if (j.type === 'content_block_delta' && (j.delta?.type === 'thinking_delta' || j.delta?.type === 'signature_delta')) continue;
          if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
            text += j.delta.text;
            onToken(j.delta.text);
          }
          if (j.type === 'content_block_delta' && j.delta?.type === 'input_json_delta') {
            const idx = j.index as number;
            if (!bmap.has(idx)) bmap.set(idx, { id: '', name: '', args: '' });
            bmap.get(idx)!.args += j.delta.partial_json;
          }
          if (j.type === 'content_block_start' && j.content_block?.type === 'tool_use') {
            bmap.set(j.index as number, { id: j.content_block.id, name: j.content_block.name, args: '' });
          }
          // Handle per-block stop reasons (content_block_stop events)
          if (j.type === 'content_block_stop' && bmap.has(j.index as number)) {
            const b = bmap.get(j.index)!;
            if (!b.id && !b.name) bmap.delete(j.index);
          }
          if (j.type === 'message_delta') {
            if (j.usage) {
              usage = { inputTokens: j.usage.input_tokens || 0, outputTokens: j.usage.output_tokens || 0 };
            }
            if (j.delta?.stop_reason) {
              stopReason = j.delta.stop_reason;
            }
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
  return { text, toolCalls: calls, usage, stopReason };
}

// ── OpenAI Chat Completions API ──

function toOpenAITools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function streamChatOpenAI(
  config: ApiConfig,
  messages: Message[],
  tools: ToolDef[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const url = `${config.baseURL || 'https://api.openai.com/v1'}/chat/completions`;
  const openaiMessages: unknown[] = [];
  let text = '';
  const calls: ToolCall[] = [];
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  let stopReason: string | undefined;
  // Build OpenAI-format messages with proper tool call history
  for (const m of messages) {
    if (m.role === 'system') {
      openaiMessages.push({ role: 'system', content: m.content });
    } else if (m.role === 'user') {
      if (m.attachments?.length) {
        // Vision message with images
        const content: unknown[] = [];
        for (const att of m.attachments) {
          if (att.type === 'image' && att.content) {
            content.push({
              type: 'image_url',
              image_url: { url: att.content.startsWith('data:') ? att.content : `data:${att.mimeType || 'image/png'};base64,${att.content}` },
            });
          }
        }
        if (m.content) content.push({ type: 'text', text: m.content });
        openaiMessages.push({ role: 'user', content });
      } else {
        openaiMessages.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      const tcArr = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
      openaiMessages.push({ role: 'assistant', content: m.content || null, tool_calls: tcArr });
    } else if (m.role === 'assistant') {
      openaiMessages.push({ role: 'assistant', content: m.content || null });
    } else if (m.role === 'tool') {
      openaiMessages.push({
        role: 'tool',
        tool_call_id: m.toolCallId || 'unknown',
        content: m.content,
      });
    }
  }

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    messages: openaiMessages,
    stream: true,
  };
  if (tools.length > 0) {
    body['tools'] = toOpenAITools(tools);
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buf = '';
  // Track tool calls by index for accumulation
  const tcMap = new Map<number, { id: string; name: string; args: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const payload = t.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const choice = j.choices?.[0];
          if (!choice) continue;

          // Text delta
          if (choice.delta?.content) {
            text += choice.delta.content;
            onToken(choice.delta.content);
          }

          // Tool call delta
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index as number;
              if (!tcMap.has(idx)) {
                tcMap.set(idx, { id: '', name: '', args: '' });
              }
              const entry = tcMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.args += tc.function.arguments;
            }
          }

          // Usage (comes in final chunk usually)
          if (j.usage) {
            usage = { inputTokens: j.usage.prompt_tokens || 0, outputTokens: j.usage.completion_tokens || 0 };
          }
          // Stop reason
          if (choice.finish_reason) {
            stopReason = choice.finish_reason;
          }
        } catch {}
      }
    }
  } finally { reader.releaseLock(); }

  for (const [, b] of tcMap) {
    if (b.name) {
      try { calls.push({ id: b.id, name: b.name, args: JSON.parse(b.args || '{}') }); }
      catch { calls.push({ id: b.id, name: b.name, args: {} }); }
    }
  }
  return { text, toolCalls: calls, usage, stopReason };
}

// ── Ollama API ──

function toOllamaTools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function streamChatOllama(
  config: ApiConfig,
  messages: Message[],
  tools: ToolDef[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const url = `${config.baseURL || 'http://localhost:11434'}/api/chat`;
  let text = '';
  const calls: ToolCall[] = [];
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  let stopReason: string | undefined;
  const ollamaMessages = messages.map((m) => {
    const entry: Record<string, unknown> = { role: m.role === 'tool' ? 'user' : m.role, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      entry['tool_calls'] = m.toolCalls.map((tc) => ({
        function: { name: tc.name, arguments: tc.args },
      }));
    }
    // Ollama images: pass as base64 array alongside content
    if (m.role === 'user' && m.attachments?.length) {
      const images: string[] = [];
      for (const att of m.attachments) {
        if (att.type === 'image' && att.content) {
          images.push(att.content.replace(/^data:image\/\w+;base64,/, ''));
          entry['images'] = images;
        }
      }
    }
    return entry;
  });

  const body: Record<string, unknown> = {
    model: config.model,
    messages: ollamaMessages,
    stream: true,
  };
  if (tools.length > 0) {
    body['tools'] = toOllamaTools(tools);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey && config.apiKey !== 'ollama') {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t);
          // Text delta
          if (j.message?.content) {
            text += j.message.content;
            onToken(j.message.content);
          }
          // Tool calls (Ollama sends complete, not streaming partials)
          if (j.message?.tool_calls) {
            for (const tc of j.message.tool_calls) {
              calls.push({
                id: tc.function?.name || 'tool_' + Math.random().toString(36).slice(2, 8),
                name: tc.function?.name || 'unknown',
                args: tc.function?.arguments || {},
              });
            }
          }
          // Done / stop reason
          if (j.done) {
            usage = {
              inputTokens: j.prompt_eval_count || 0,
              outputTokens: j.eval_count || 0,
            };
            stopReason = j.done_reason || 'stop';
          }
        } catch {}
      }
    }
  } finally { reader.releaseLock(); }

  return { text, toolCalls: calls, usage, stopReason };
}
