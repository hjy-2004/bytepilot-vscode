/**
 * Tauri desktop platform adapter.
 *
 * Handles ALL UI messages locally: config, models, sessions.
 * Uses Tauri invoke for persistence and logging when available.
 * Falls back to in-memory state when running without Rust backend.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';
import { streamChat } from '@bytepilot/core/ai/api-client';
import type { Message } from '@bytepilot/core/ai/message-types';

// ── Mini diff generator (avoid importing diff npm package) ──────────

interface DiffLine { type: 'context' | 'added' | 'removed'; oldLineNumber?: number; newLineNumber?: number; content: string; }
interface DiffHunk { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[]; }
interface LocalDiff { fileName: string; stats: { additions: number; deletions: number }; hunks: DiffHunk[]; }

function simpleDiff(fileName: string, original: string, modified: string): LocalDiff | undefined {
  if (original === modified) return undefined;
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const additions = Math.max(0, modLines.length - origLines.length);
  const deletions = Math.max(0, origLines.length - modLines.length);
  const maxLen = Math.max(origLines.length, modLines.length);
  const lines: DiffLine[] = [];
  let oldNum = 1, newNum = 1;
  for (let i = 0; i < maxLen; i++) {
    const ol = i < origLines.length ? origLines[i] : undefined;
    const ml = i < modLines.length ? modLines[i] : undefined;
    if (ol === ml) {
      if (ol !== undefined) lines.push({ type: 'context', oldLineNumber: oldNum++, newLineNumber: newNum++, content: ol });
    } else {
      if (ol !== undefined) { lines.push({ type: 'removed', oldLineNumber: oldNum++, content: ol }); }
      if (ml !== undefined) { lines.push({ type: 'added', newLineNumber: newNum++, content: ml }); }
    }
  }
  const hunk: DiffHunk = { oldStart: 1, oldLines: origLines.length, newStart: 1, newLines: modLines.length, lines };
  return { fileName, stats: { additions, deletions }, hunks: [hunk] };
}

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

interface ProjectEntry {
  name: string;
  path: string;
  is_dir: boolean;
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
let _chatHistory: Message[] = [];
let _abortController: AbortController | null = null;
let _workspaceRoot: string = '';
let _projectFiles: ProjectEntry[] = [];
let _rulesContent: string = '';

function buildSystemPrompt(): string {
  let prompt = `You are BytePilot, an AI coding assistant running as a desktop app. You help developers write, understand, and debug code.

## Available Tools
You have access to file and system tools. When you need to use one, write the tool call on its own line:

read_file(path) — read a file (use startLine/endLine for large files)
write_file(path, content) — create or overwrite a file
edit_file(path, old_string, new_string) — precise string replacement
list_directory(path?) — list directory contents
search_files(pattern) — search file contents (grep)
execute_command(command) — run a shell command (30s timeout)

Always read a file before editing it. Prefer edit_file over write_file for changes.

## Workspace Context`;
  if (_workspaceRoot) {
    prompt += `\nWorkspace: ${_workspaceRoot}`;
    if (_projectFiles.length > 0) {
      const files = _projectFiles.slice(0, 80).map(f => `- ${f.path}${f.is_dir ? '/' : ''}`).join('\n');
      prompt += `\n\nProject structure (${_projectFiles.length} entries, showing first 80):\n${files}`;
    }
    if (_rulesContent) {
      prompt += `\n\n## Project Rules (.bytepilotrules)\n${_rulesContent}`;
    }
  } else {
    prompt += '\n(No workspace selected. Use the folder picker or launch from your project directory.)';
  }
  return prompt;
}


// ── Tauri API ───────────────────────────────────────────────────────

let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function initTauri(): Promise<void> {
  // Prefer window.__TAURI_INTERNALS__ (Tauri v2), fall back to dynamic import
  const w = window as any;
  try {
    if (w.__TAURI_INTERNALS__) {
      // Tauri v2 — get invoke from the internals
      const { invoke: tauriInvoke } = w.__TAURI_INTERNALS__;
      _invoke = async (cmd: string, args?: Record<string, unknown>) => {
        return tauriInvoke(cmd, args);
      };
    } else {
      const mod = await import('@tauri-apps/api/core');
      _invoke = mod.invoke;
    }
    if (!_invoke) return;

    // Restore config from Rust backend
    try {
      const provider = await _invoke('cmd_get_config', { key: 'provider' }) as string;
      if (provider) {
        _config.provider = provider;
        _config.chatModel = (await _invoke('cmd_get_config', { key: 'chatModel' }) as string) || _config.chatModel;
        _config.baseURL = (await _invoke('cmd_get_config', { key: 'baseURL' }) as string) || _config.baseURL;
      }
      const knownProviders = Object.keys(PRESETS);
      for (const pid of knownProviders) {
        try {
          const key = await _invoke('cmd_get_config', { key: `apiKey.${pid}` }) as string;
          if (key) _apiKeys.push({ providerId: pid, apiKey: key });
        } catch { /* skip if not set */ }
      }
      console.log(`[TauriAdapter] Loaded config from Rust store, ${_apiKeys.length} API keys restored`);
    } catch (e) { console.log('[TauriAdapter] Config load failed:', e); }
  } catch (e) {
    console.log('[TauriAdapter] Running without Rust backend — using in-memory state', e);
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

      case 'context.refresh':
        loadWorkspaceContext();
        break;

      default:
        // Handle dynamic messages not in the type union
        if ((message as any).type === 'workspace.pick') {
          pickWorkspaceFolder();
        } else {
          console.log('[TauriAdapter] Unhandled message:', message.type);
        }
        break;
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

  // Load workspace context in background
  loadWorkspaceContext().then(() => {
    if (handler === _handler) {
      handler({
        type: 'context.update',
        payload: {
          openFiles: [],
          projectFiles: _projectFiles.length,
          diagnosticsCount: 0,
          hasRules: !!_rulesContent,
        },
      });
    }
  });

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

// ── Workspace ────────────────────────────────────────────────────────

async function loadWorkspaceContext(): Promise<void> {
  if (!_invoke) return;
  try {
    _workspaceRoot = (await _invoke('cmd_get_workspace')) as string;
    const struct = await _invoke('cmd_scan_project') as { root: string; files: ProjectEntry[] };
    _projectFiles = struct.files || [];
    const rules = await _invoke('cmd_read_rules') as string | null;
    _rulesContent = rules || '';
    console.log(`[TauriAdapter] Workspace: ${_workspaceRoot}, ${_projectFiles.length} files, rules: ${!!_rulesContent}`);
  } catch (e) {
    console.log('[TauriAdapter] Workspace context unavailable:', e);
  }
}

async function tryRead(relativePath: string, fallback: string): Promise<string> {
  if (!_invoke) return fallback;
  try { return await _invoke('cmd_read_file_workspace', { relativePath }) as string; } catch { return fallback; }
}

async function pickWorkspaceFolder(): Promise<void> {
  if (!_invoke) {
    // Fallback: try to re-init Tauri
    await initTauri();
    if (!_invoke) {
      alert('Folder picker requires the desktop app. If you are running in a browser, you cannot open folders.');
      return;
    }
  }
  try {
    const folder = await _invoke('cmd_pick_folder') as string | null;
    if (folder) {
      await _invoke('cmd_set_workspace', { path: folder });
      _workspaceRoot = folder;
      await loadWorkspaceContext();
      _chatHistory = [];
      if (_handler) {
        _handler({
          type: 'context.update',
          payload: {
            openFiles: [],
            projectFiles: _projectFiles.length,
            diagnosticsCount: 0,
            hasRules: !!_rulesContent,
            workspaceRoot: _workspaceRoot,
          },
        });
      }
    }
  } catch (e) {
    console.error('[TauriAdapter] pickWorkspaceFolder error:', e);
    alert('Failed to open folder. Make sure you are running the Tauri desktop app, not in a browser.');
  }
}

// ── File Tools ───────────────────────────────────────────────────────

async function executeTool(toolName: string, args: Record<string, string>): Promise<string> {
  if (!_invoke) return 'Error: Workspace not available. Open a folder first.';

  try {
    switch (toolName) {
      case 'read_file': {
        const path = args.path || args.filePath || '';
        if (!path) return 'Error: No file path provided.';
        const startLine = parseInt(args.startLine || '0') || undefined;
        const endLine = parseInt(args.endLine || '0') || undefined;
        let content = await _invoke('cmd_read_file_workspace', { relativePath: path }) as string;
        if (startLine && endLine) {
          const lines = content.split('\n');
          content = lines.slice(startLine - 1, endLine).join('\n');
          content = `(lines ${startLine}-${endLine} of ${lines.length})\n${content}`;
        } else if (content.length > 50000) {
          content = content.substring(0, 50000) + `\n...(truncated, ${content.length} total chars)`;
        }
        return content;
      }

      case 'write_file': {
        const p = args.path || args.filePath || '';
        const c = args.content || '';
        if (!p || c === undefined) return 'Error: path and content required.';
        await _invoke('cmd_write_file_workspace', { relativePath: p, content: c });
        return `Wrote ${c.split('\n').length} lines to "${p}".`;
      }

      case 'edit_file': {
        const p = args.path || args.filePath || '';
        const oldStr = args.old_string || args.oldString || '';
        const newStr = args.new_string || args.newString || '';
        if (!p || !oldStr) return 'Error: path and old_string required.';
        const original = await _invoke('cmd_read_file_workspace', { relativePath: p }) as string;
        // Normalize newlines
        const nor = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const norOrig = nor(original);
        const norOld = nor(oldStr);
        let idx = original.indexOf(oldStr);
        if (idx === -1) idx = norOrig.indexOf(norOld);
        if (idx === -1) {
          // Try showing context to help
          const lines = norOrig.split('\n');
          const firstLine = norOld.split('\n')[0] || '';
          let hint = '';
          for (const line of lines) {
            if (line.trim() && line.includes(firstLine.trim().substring(0, 10))) {
              hint = ` Did you mean: "${line.trim().substring(0, 80)}"?`;
              break;
            }
          }
          return `Error: old_string not found in "${p}".${hint} Try reading the file first to see the exact content.`;
        }
        const actualLen = norOld.length;
        const after = norOrig.substring(idx + actualLen);
        if (after.includes(norOld)) {
          return 'Error: old_string matches multiple locations. Add more surrounding context to make it unique.';
        }
        const isCRLF = original.includes('\r\n');
        const newNormalized = nor(newStr);
        const edited = norOrig.substring(0, idx) + newNormalized + norOrig.substring(idx + actualLen);
        const final = isCRLF ? edited.replace(/\n/g, '\r\n') : edited;
        await _invoke('cmd_write_file_workspace', { relativePath: p, content: final });
        const changed = (final.match(/\n/g) || []).length - (original.match(/\n/g) || []).length;
        const lineNote = changed !== 0 ? ` (${changed > 0 ? '+' : ''}${changed} lines)` : '';
        return `Edited "${p}": replaced ${oldStr.length}→${newStr.length} chars${lineNote}.`;
      }

      case 'list_directory': {
        const dir = args.path || args.directoryPath || '';
        const entries = await _invoke('cmd_list_dir_workspace', { relativePath: dir || null }) as Array<[string, boolean]>;
        if (entries.length === 0) return '(empty directory)';
        return entries.map(([name, isDir]) => `${isDir ? '📁' : '📄'} ${name}${isDir ? '/' : ''}`).join('\n');
      }

      case 'search_files': {
        const pattern = args.pattern || '';
        if (!pattern) return 'Error: No search pattern provided.';
        const results = await _invoke('cmd_search_content', { pattern, maxResults: 20 }) as string[];
        return results.join('\n');
      }

      case 'execute_command': {
        const cmd = args.command || '';
        const cwd = args.workingDirectory || args.working_directory || _workspaceRoot;
        if (!cmd) return 'Error: No command provided.';
        // Security: block dangerous patterns
        const dangerous = /rm\s+-rf\s+\/|git\s+push.*--force.*\s+(main|master)|curl.*\|\s*(ba)?sh|>\/dev\/sd/;
        if (dangerous.test(cmd)) return 'Error: Blocked dangerous command.';
        const result = await _invoke('cmd_execute_command', { command: cmd, cwd, timeoutMs: 30000 }) as {
          stdout: string; stderr: string; exit_code: number; killed: boolean;
        };
        if (result.killed) return `Timed out after 30s.\n\n${result.stdout}`;
        const out = [result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ''].filter(Boolean).join('');
        return out.substring(0, 5000) || '(no output)';
      }

      default:
        return `Unknown tool: ${toolName}. Available: read_file, write_file, edit_file, list_directory, search_files, execute_command.`;
    }
  } catch (e: any) {
    return `Error executing ${toolName}: ${e?.message || e}`;
  }
}

/** Parse tool calls from AI response. Returns array of {tool, args}. */
function parseToolCalls(text: string): Array<{ tool: string; args: Record<string, string> }> {
  const results: Array<{ tool: string; args: Record<string, string> }> = [];
  // Match fenced code blocks with language "tool"
  const blockRegex = /```tool\n([\s\S]*?)```/g;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1];
    const lines = blockContent.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const m = line.match(/^(\w+)\((.*)\)\s*$/);
      if (!m) continue;
      const toolName = m[1];
      const argsStr = m[2];
      const args: Record<string, string> = {};
      // Parse key=value pairs handling quoted values
      const argRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let argMatch;
      while ((argMatch = argRegex.exec(argsStr)) !== null) {
        const key = argMatch[1];
        const value = argMatch[2] ?? argMatch[3] ?? argMatch[4];
        args[key] = value;
      }
      // If single argument without key= format, use positional
      if (Object.keys(args).length === 0 && argsStr.trim()) {
        // Try to guess: first argument = path/pattern
        const commonFirstArgs: Record<string, string> = {
          read_file: 'path', write_file: 'path', edit_file: 'path',
          list_directory: 'path', search_files: 'pattern', execute_command: 'command',
        };
        const key = commonFirstArgs[toolName] || 'path';
        args[key] = argsStr.trim();
      }
      results.push({ tool: toolName, args });
    }
  }
  return results;
}

// ── Chat Engine ─────────────────────────────────────────────────────

async function handleChatSend(content: string): Promise<void> {
  if (!_handler) return;

  const apiKey = _apiKeys.find(k => k.providerId === _config.provider)?.apiKey || '';
  const baseURL = _config.baseURL;

  if (!apiKey && _config.provider !== 'ollama') {
    _handler({ type: 'chat.error', payload: { message: 'No API key configured. Set an API key in Model Settings → Custom tab.', code: 'NO_API_KEY' } } as ExtensionMessage);
    return;
  }

  _chatHistory.push({ role: 'user', content });
  _handler({ type: 'chat.started', payload: {} } as ExtensionMessage);

  _abortController = new AbortController();
  const MAX_TOOL_TURNS = 5;

  try {
    // Multi-turn loop: AI response → tool execution → feed back → repeat
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      console.log(`[TauriAdapter] Chat turn ${turn + 1}/${MAX_TOOL_TURNS}`);
      const sysPrompt = buildSystemPrompt();
      const messages: Message[] = [
        { role: 'system', content: sysPrompt },
        ..._chatHistory,
      ];

      const allMessages: Message[] = [
        { role: 'system', content: buildSystemPrompt() },
        ..._chatHistory,
      ];

      let fullText = '';
      let bufferingTool = false;
      await streamChat(
        { apiKey, baseURL, model: _config.chatModel, maxTokens: _config.maxTokens || 4096, thinkingBudget: 0, provider: _config.provider },
        allMessages,
        [],
        (token: string) => {
          fullText += token;
          // Detect tool invocation start — stop forwarding tokens to UI.
          // Matches: ```tool\n, ```tool\n, or Claude's "tool\nCopy\nname(args)" pattern
          if (!bufferingTool) {
            const hasToolBlock = fullText.includes('```tool') || /(?:^|\n)tool\s*\n(?:Copy\s*\n)?\w+\(/.test(fullText);
            if (hasToolBlock) bufferingTool = true;
          }
          if (!bufferingTool) {
            if (_handler) _handler({ type: 'chat.token', payload: { text: token } } as ExtensionMessage);
          }
        },
        _abortController.signal,
      );

      // Strip tool sections from displayed text
      const cleanText = fullText
        .replace(/```tool[\s\S]*?```/g, '')
        .replace(/(?:^|\n)tool\s*\n(?:Copy\s*\n)?[\s\S]*?(?=\n\n|$)/g, '')
        .trim();

      // Parse tool calls
      const toolCalls = parseToolCalls(fullText);
      if (toolCalls.length === 0) {
        _chatHistory.push({ role: 'assistant', content: cleanText });
        if (_handler) _handler({ type: 'chat.done', payload: { usage: { inputTokens: 0, outputTokens: 0 } } } as ExtensionMessage);
        return;
      }

      // Execute tools with structured messages (for UI diff rendering)
      console.log(`[TauriAdapter] Executing ${toolCalls.length} tool(s):`, toolCalls.map(t => t.tool));
      const toolResults: string[] = [];
      let toolIndex = 0;
      for (const tc of toolCalls) {
        toolIndex++;
        const toolId = `${Date.now()}-${toolIndex}`;
        const displayName = tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        // Send tool call to UI
        if (_handler) {
          _handler({
            type: 'chat.toolCall',
            payload: { id: toolId, name: tc.tool, displayName, args: tc.args, needsApproval: false },
          } as ExtensionMessage);
        }

        // For write/edit tools, try to compute a diff
        let diff: LocalDiff | undefined;
        if ((tc.tool === 'write_file' || tc.tool === 'edit_file') && tc.args.path) {
          try {
            const orig = await _invoke?.('cmd_read_file_workspace', { relativePath: tc.args.path }) as string | undefined;
            const result = await executeTool(tc.tool, tc.args);
            toolResults.push(`Tool: ${tc.tool}(${JSON.stringify(tc.args)}) → ${result}`);
            if (orig !== undefined) {
              const newContent = await _invoke?.('cmd_read_file_workspace', { relativePath: tc.args.path }) as string;
              diff = simpleDiff(tc.args.path, orig, newContent);
            }
            // Send tool result
            if (_handler) {
              _handler({
                type: 'chat.toolResult',
                payload: { id: toolId, name: tc.tool, result, success: !result.startsWith('Error'), diff: diff as any },
              } as ExtensionMessage);
            }
            continue;
          } catch { /* fall through to normal execution */ }
        }

        const result = await executeTool(tc.tool, tc.args);
        toolResults.push(`Tool: ${tc.tool}(${JSON.stringify(tc.args)}) → ${result}`);

        if (_handler) {
          _handler({
            type: 'chat.toolResult',
            payload: { id: toolId, name: tc.tool, result, success: !result.startsWith('Error') },
          } as ExtensionMessage);
        }

        // Send tool result to UI (with diff if available)
        if (_handler) {
          _handler({
            type: 'chat.toolResult',
            payload: { id: toolId, name: tc.tool, result, success: !result.startsWith('Error'), diff },
          } as ExtensionMessage);
        }
      }

      // Feed tool results back to AI (clean text only)
      _chatHistory.push({
        role: 'assistant',
        content: cleanText + '\n\n' + toolResults.map(r => `\`\`\`tool-result\n${r}\n\`\`\``).join('\n'),
      });
    }

    // Max turns reached — finalize
    _chatHistory.push({ role: 'assistant', content: '(Max tool turns reached. Send another message to continue.)' });
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.error('[TauriAdapter] Chat error:', err);
    if (_handler) {
      _handler({ type: 'chat.error', payload: { message: err?.message || 'Unknown error', code: 'CHAT_ERROR' } } as ExtensionMessage);
    }
  } finally {
    _abortController = null;
    if (_handler) _handler({ type: 'chat.done', payload: { usage: { inputTokens: 0, outputTokens: 0 } } } as ExtensionMessage);
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
