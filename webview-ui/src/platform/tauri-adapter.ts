/**
 * Tauri desktop platform adapter.
 *
 * Handles ALL UI messages locally: config, models, sessions.
 * Uses Tauri invoke for persistence and logging when available.
 * Falls back to in-memory state when running without Rust backend.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';

// ── State ───────────────────────────────────────────────────────────

interface AppConfig {
  provider: string;
  chatModel: string;
  completionModel: string;
  baseURL: string;
  temperature: number;
  maxTokens: number;
  completionsEnabled: boolean;
  availableModels: Array<{ id: string; name: string }>;
  initialized: boolean;
  displayProvider: string;
}

interface StoredKey {
  providerId: string;
  apiKey: string;
}

const DEFAULT_CONFIG: AppConfig = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  completionModel: '',
  baseURL: 'https://api.anthropic.com/v1',
  temperature: 0.7,
  maxTokens: 4096,
  completionsEnabled: true,
  availableModels: [],
  initialized: true,
  displayProvider: 'Anthropic (Desktop)',
};

let _config: AppConfig = { ...DEFAULT_CONFIG };
let _apiKeys: StoredKey[] = [];
let _sessions: Array<{ id: string; title: string; messageCount: number; updatedAt: number }> = [];
let _chatHistory: ChatMessage[] = [];
let _abortController: AbortController | null = null;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are an AI coding assistant, running in the BytePilot desktop app. You help developers write, understand, and debug code. Be concise and helpful.`;

// ── Minimal AI Chat (fetch + SSE) ────────────────────────────────────

async function callAI(
  provider: string,
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const base = baseURL.replace(/\/+$/, '');
  const isOllama = provider === 'ollama';

  if (isOllama) {
    // Ollama /api/chat (non-streaming for simplicity)
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal,
    });
    const data = await res.json() as any;
    const text = data.message?.content || '';
    if (text) onToken(text);
    return text;
  }

  // OpenAI-compatible /chat/completions with SSE streaming
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
      max_tokens: 4096,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err.substring(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  let fullText = '';
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onToken(delta);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  return fullText;
}

// ── Tauri API ───────────────────────────────────────────────────────

let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function initTauri(): Promise<void> {
  try {
    const mod = await import('@tauri-apps/api/core');
    _invoke = mod.invoke;
    // Restore config from Rust backend
    try {
      const provider = await _invoke('cmd_get_config', { key: 'provider' }) as string;
      if (provider) {
        _config.provider = provider;
        _config.chatModel = (await _invoke('cmd_get_config', { key: 'chatModel' }) as string) || _config.chatModel;
        _config.baseURL = (await _invoke('cmd_get_config', { key: 'baseURL' }) as string) || _config.baseURL;
      }
      console.log('[TauriAdapter] Loaded config from Rust store');
    } catch { /* use defaults */ }
  } catch {
    console.log('[TauriAdapter] Running without Rust backend — using in-memory state');
  }
}

async function writeLog(level: string, message: string, errorDetail?: string): Promise<void> {
  if (!_invoke) return;
  try {
    await _invoke('cmd_write_log', { level, message: message.substring(0, 2000), errorDetail: errorDetail?.substring(0, 2000) || null });
  } catch { /* ignore */ }
}

async function persistConfig(): Promise<void> {
  if (!_invoke) return;
  try {
    await _invoke('cmd_set_config', { key: 'provider', value: _config.provider });
    await _invoke('cmd_set_config', { key: 'chatModel', value: _config.chatModel });
    await _invoke('cmd_set_config', { key: 'baseURL', value: _config.baseURL });
  } catch { /* ignore */ }
}

// ── Provider info ───────────────────────────────────────────────────

interface ProviderInfo {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
}

const PRESETS: Record<string, ProviderInfo> = {
  anthropic:     { id: 'anthropic',     name: 'Anthropic',     baseURL: 'https://api.anthropic.com/v1',           defaultModel: 'claude-sonnet-4-6' },
  openai:        { id: 'openai',        name: 'OpenAI',        baseURL: 'https://api.openai.com/v1',              defaultModel: 'gpt-4o' },
  deepseek:      { id: 'deepseek',      name: 'DeepSeek',      baseURL: 'https://api.deepseek.com/v1',            defaultModel: 'deepseek-v4-pro' },
  google:        { id: 'google',        name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-pro' },
  ollama:        { id: 'ollama',        name: 'Ollama',        baseURL: 'http://localhost:11434/v1',              defaultModel: 'codellama' },
  'azure-openai':{ id: 'azure-openai',  name: 'Azure OpenAI',  baseURL: '',                                        defaultModel: 'gpt-4o' },
  moonshot:      { id: 'moonshot',      name: 'Kimi (Moonshot)',baseURL: 'https://api.moonshot.cn/v1',             defaultModel: 'kimi-k2.7-code' },
  zhipu:         { id: 'zhipu',         name: 'GLM',          baseURL: 'https://open.bigmodel.cn/api/paas/v4',   defaultModel: 'glm-5.1' },
  minimax:       { id: 'minimax',       name: 'MiniMax',       baseURL: 'https://api.minimaxi.com/v1',             defaultModel: 'MiniMax-M2.7' },
  openrouter:    { id: 'openrouter',    name: 'OpenRouter',    baseURL: 'https://openrouter.ai/api/v1',            defaultModel: 'openai/gpt-4o' },
  siliconflow:   { id: 'siliconflow',   name: 'SiliconFlow',   baseURL: 'https://api.siliconflow.cn/v1',           defaultModel: 'deepseek-ai/DeepSeek-V3' },
};

function getProviderInfo(id: string): ProviderInfo | undefined {
  return PRESETS[id];
}

function buildDisplayName(config: AppConfig): string {
  const preset = getProviderInfo(config.provider);
  if (preset) return `${preset.name} (Desktop)`;
  return `${config.provider} (Desktop)`;
}

// ── Model Fetching ──────────────────────────────────────────────────

async function fetchModelsFromProvider(
  baseURL: string,
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  if (!baseURL) return [];
  const base = baseURL.replace(/\/+$/, '');

  // Try OpenAI-compatible endpoint
  try {
    const res = await fetch(`${base}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json() as any;
      const list = data.data || data.models || [];
      return list.map((m: any) => ({
        id: m.id || m.name?.replace('models/', '') || '',
        name: m.name || m.id || m.displayName || '',
      })).filter((m: any) => m.id);
    }
  } catch { /* try next */ }

  return [];
}

// ── Adapter Implementation ──────────────────────────────────────────

let _handler: ((message: ExtensionMessage) => void) | null = null;
let _initSent = false;

export const tauriAdapter: IPlatformAdapter = {
  postMessage(message: WebViewMessage): void {
    console.log('[TauriAdapter] postMessage:', message.type);
    writeLog('info', `WebView → Backend: ${message.type}`);

    switch (message.type) {
      case 'config.get':
        enqueueInitMessages();
        break;

      case 'config.set': {
        const p = (message as any).payload || {};
        if (p.provider) {
          const preset = getProviderInfo(p.provider);
          _config.provider = p.provider;
          _config.chatModel = p.chatModel || preset?.defaultModel || _config.chatModel;
          _config.baseURL = p.baseURL !== undefined ? p.baseURL : (preset?.baseURL || _config.baseURL);
        } else if (p.chatModel) {
          _config.chatModel = p.chatModel;
        }
        if (p.baseURL !== undefined) _config.baseURL = p.baseURL;
        _config.displayProvider = buildDisplayName(_config);
        persistConfig();
        if (_handler) {
          _handler({
            type: 'config.state',
            payload: { ..._config },
          });
        }
        break;
      }

      case 'config.setKey': {
        const pk = (message as any).payload || {};
        const existing = _apiKeys.find(k => k.providerId === pk.providerId);
        if (existing) existing.apiKey = pk.apiKey;
        else _apiKeys.push({ providerId: pk.providerId, apiKey: pk.apiKey });
        if (_invoke) {
          _invoke('cmd_set_config', { key: `apiKey.${pk.providerId}`, value: pk.apiKey }).catch(() => {});
        }
        break;
      }

      case 'models.fetch': {
        (async () => {
          const key = _apiKeys.find(k => k.providerId === _config.provider)?.apiKey || '';
          const models = await fetchModelsFromProvider(_config.baseURL, key);
          if (_handler) {
            _handler({
              type: 'models.list',
              payload: { models, sourceUrl: _config.baseURL },
            });
          }
        })();
        break;
      }

      case 'session.list':
        if (_handler) {
          _handler({ type: 'session.list', payload: { sessions: _sessions } });
        }
        break;

      case 'session.create': {
        const id = `desktop-${Date.now()}`;
        _sessions.push({ id, title: 'New Chat', messageCount: 0, updatedAt: Date.now() });
        if (_handler) {
          _handler({ type: 'session.list', payload: { sessions: _sessions } });
        }
        break;
      }

      case 'session.switch':
      case 'session.delete': {
        const sid = (message as any).payload?.sessionId;
        if (sid && message.type === 'session.delete') {
          _sessions = _sessions.filter(s => s.id !== sid);
        }
        if (_handler) {
          _handler({ type: 'session.list', payload: { sessions: _sessions } });
        }
        break;
      }

      case 'tool.approve':
      case 'tool.reject':
        // For now, auto-respond. Full approval flow requires engine integration.
        console.log('[TauriAdapter] Tool approval:', message.type);
        break;

      case 'chat.send': {
        const content = (message as any).payload?.content || '';
        if (!content) break;
        handleChatSend(content);
        break;
      }

      case 'chat.cancel':
        if (_abortController) {
          _abortController.abort();
          _abortController = null;
        }
        break;

      case 'chat.clear':
        _chatHistory = [];
        if (_handler) _handler({ type: 'chat.clear' } as ExtensionMessage);
        break;

      default:
        console.log('[TauriAdapter] Unhandled message:', message.type);
    }
  },

  onMessage(handler: (message: ExtensionMessage) => void): () => void {
    console.log('[TauriAdapter] onMessage registered');
    initTauri();
    _handler = handler;
    setTimeout(() => {
      if (_handler === handler) sendInitMessages(handler);
    }, 10);
    return () => { _handler = null; };
  },
};

function enqueueInitMessages(): void {
  if (_handler) sendInitMessages(_handler);
}

function sendInitMessages(handler: (message: ExtensionMessage) => void): void {
  if (_initSent) return;
  _initSent = true;
  console.log('[TauriAdapter] Sending synthetic init messages');

  handler({
    type: 'config.state',
    payload: { ..._config },
  });

  handler({
    type: 'session.list',
    payload: { sessions: _sessions },
  });

  handler({
    type: 'chat.state',
    payload: { messages: [] },
  });
}

// ── Chat Engine ─────────────────────────────────────────────────────

async function handleChatSend(content: string): Promise<void> {
  if (!_handler) return;

  const apiKey = _apiKeys.find(k => k.providerId === _config.provider)?.apiKey || '';
  const baseURL = _config.baseURL;

  // Warn if no API key
  if (!apiKey && _config.provider !== 'ollama') {
    _handler({ type: 'chat.error', payload: { message: 'No API key configured. Please set an API key in Model Settings → Custom tab.', code: 'NO_API_KEY' } } as ExtensionMessage);
    return;
  }

  // Add user message to history
  _chatHistory.push({ role: 'user', content });

  // Notify UI that chat started
  _handler({ type: 'chat.started', payload: {} } as ExtensionMessage);

  // Stream tokens via fetch + SSE
  let fullText = '';
  _abortController = new AbortController();

  try {
    await callAI(
      _config.provider,
      baseURL,
      apiKey,
      _config.chatModel,
      _chatHistory,
      (token: string) => {
        fullText += token;
        if (_handler) {
          _handler({ type: 'chat.token', payload: { text: token } } as ExtensionMessage);
        }
      },
      _abortController.signal,
    );

    // Add assistant response to history
    _chatHistory.push({ role: 'assistant', content: fullText });

    // Notify UI
    if (_handler) {
      _handler({
        type: 'chat.done',
        payload: { usage: { inputTokens: 0, outputTokens: 0 } },
      } as ExtensionMessage);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.error('[TauriAdapter] Chat error:', err);
    if (_handler) {
      _handler({
        type: 'chat.error',
        payload: { message: err?.message || 'Unknown error', code: 'CHAT_ERROR' },
      } as ExtensionMessage);
    }
  } finally {
    _abortController = null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function getDesktopLogPath(): Promise<string> {
  if (!_invoke) return '';
  try { return (await _invoke('cmd_get_log_path')) as string; } catch { return ''; }
}

export async function getDesktopLogStats(): Promise<{ path: string; size: number } | null> {
  if (!_invoke) return null;
  try { return (await _invoke('cmd_get_log_stats')) as { path: string; size: number }; } catch { return null; }
}
