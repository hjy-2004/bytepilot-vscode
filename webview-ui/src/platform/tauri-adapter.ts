/**
 * Tauri desktop platform adapter.
 * Handles ALL UI messages: config, models, sessions, chat, tools.
 * Uses @bytepilot/core's streamChat with native tool calling.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';
import { streamChat } from '@bytepilot/core/ai/api-client';
import type { Message } from '@bytepilot/core/ai/message-types';

// ── Tool definitions for native API tool calling ──────────────────────

const TOOL_DEFS = [
  { name: 'read_file', description: 'Read a file from the workspace. Use startLine/endLine for large files.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, startLine: { type: 'number', description: 'Start line (1-indexed, optional)' }, endLine: { type: 'number', description: 'End line (1-indexed, optional)' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create a new file or completely overwrite an existing one.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, content: { type: 'string', description: 'Full content to write' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Perform exact string replacement in a file. old_string must match EXACTLY once.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, old_string: { type: 'string', description: 'The exact text to replace' }, new_string: { type: 'string', description: 'The replacement text' } }, required: ['path', 'old_string', 'new_string'] } },
  { name: 'list_directory', description: 'List directory contents. Default: workspace root.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory path (optional)' } }, required: [] } },
  { name: 'search_files', description: 'Search file contents (grep). Returns matching lines with line numbers.', parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'Text pattern to search for' } }, required: ['pattern'] } },
  { name: 'execute_command', description: 'Run a shell command. 30 second timeout.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute' }, working_directory: { type: 'string', description: 'Working directory (optional)' } }, required: ['command'] } },
];

// ── Mini diff generator ──────────────────────────────────────────────

interface DiffLine { type: 'context' | 'added' | 'removed'; oldLineNumber?: number; newLineNumber?: number; content: string; }
interface DiffHunk { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[]; }
interface LocalDiff { fileName: string; stats: { additions: number; deletions: number }; hunks: DiffHunk[]; }

function simpleDiff(fileName: string, original: string, modified: string): LocalDiff | undefined {
  if (original === modified) return undefined;
  const ol = original.split('\n'), ml = modified.split('\n');
  const max = Math.max(ol.length, ml.length);
  const lines: DiffLine[] = [];
  let on = 1, nn = 1;
  for (let i = 0; i < max; i++) {
    const o = i < ol.length ? ol[i] : undefined, m = i < ml.length ? ml[i] : undefined;
    if (o === m && o !== undefined) { lines.push({ type: 'context', oldLineNumber: on++, newLineNumber: nn++, content: o }); }
    else {
      if (o !== undefined) { lines.push({ type: 'removed', oldLineNumber: on++, content: o }); }
      if (m !== undefined) { lines.push({ type: 'added', newLineNumber: nn++, content: m }); }
    }
  }
  return { fileName, stats: { additions: ml.length - ol.length, deletions: ol.length - ml.length }, hunks: [{ oldStart: 1, oldLines: ol.length, newStart: 1, newLines: ml.length, lines }] };
}

// ── State ───────────────────────────────────────────────────────────

interface AppConfig {
  provider: string; chatModel: string; completionModel: string; baseURL: string;
  temperature: number; maxTokens: number; completionsEnabled: boolean;
  availableModels: Array<{ id: string; name: string }>; initialized: boolean; displayProvider: string;
}
interface StoredKey { providerId: string; apiKey: string; }
interface ProjectEntry { name: string; path: string; is_dir: boolean; }

const DEFAULT_CONFIG: AppConfig = { provider: 'anthropic', chatModel: 'claude-sonnet-4-6', completionModel: '', baseURL: 'https://api.anthropic.com/v1', temperature: 0.7, maxTokens: 4096, completionsEnabled: true, availableModels: [], initialized: true, displayProvider: 'Anthropic (Desktop)' };

let _config = { ...DEFAULT_CONFIG };
let _apiKeys: StoredKey[] = [];
let _sessions: Array<{ id: string; title: string; messageCount: number; updatedAt: number }> = [];
let _chatHistory: Message[] = [];
let _abortController: AbortController | null = null;
let _workspaceRoot = '';
let _projectFiles: ProjectEntry[] = [];
let _rulesContent = '';

function buildSystemPrompt(): string {
  let p = `You are BytePilot, a desktop AI coding assistant. Use tools to read/write files and run commands. Be concise.\n\n## Workspace Context`;
  if (_workspaceRoot) {
    p += `\nWorkspace: ${_workspaceRoot}`;
    if (_projectFiles.length > 0) p += `\n\nProject (${_projectFiles.length} entries, first 80):\n${_projectFiles.slice(0, 80).map(f => `- ${f.path}${f.is_dir ? '/' : ''}`).join('\n')}`;
    if (_rulesContent) p += `\n\n## Project Rules\n${_rulesContent}`;
  } else { p += '\n(No workspace. Open a folder to get started.)'; }
  return p;
}

// ── Tauri API ───────────────────────────────────────────────────────

let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function initTauri(): Promise<void> {
  const w = window as any;
  try {
    if (w.__TAURI_INTERNALS__) {
      const { invoke: i } = w.__TAURI_INTERNALS__;
      _invoke = async (c, a) => i(c, a);
    } else {
      _invoke = (await import('@tauri-apps/api/core')).invoke;
    }
    if (!_invoke) return;
    try {
      const provider = await _invoke('cmd_get_config', { key: 'provider' }) as string;
      if (provider) { _config.provider = provider; _config.chatModel = (await _invoke('cmd_get_config', { key: 'chatModel' }) as string) || _config.chatModel; _config.baseURL = (await _invoke('cmd_get_config', { key: 'baseURL' }) as string) || _config.baseURL; }
      for (const pid of Object.keys(PRESETS)) { try { const k = await _invoke('cmd_get_config', { key: `apiKey.${pid}` }) as string; if (k) _apiKeys.push({ providerId: pid, apiKey: k }); } catch { /* */ } }
      console.log(`[TauriAdapter] Loaded config, ${_apiKeys.length} API keys`);
    } catch { /* */ }
  } catch { console.log('[TauriAdapter] No Rust backend — in-memory mode'); }
}

async function wlog(level: string, msg: string, err?: string): Promise<void> {
  if (!_invoke) return;
  try { await _invoke('cmd_write_log', { level, message: msg.substring(0, 2000), errorDetail: err?.substring(0, 2000) || null }); } catch { /* */ }
}
async function persistConfig(): Promise<void> {
  if (!_invoke) return;
  try { await _invoke('cmd_set_config', { key: 'provider', value: _config.provider }); await _invoke('cmd_set_config', { key: 'chatModel', value: _config.chatModel }); await _invoke('cmd_set_config', { key: 'baseURL', value: _config.baseURL }); } catch { /* */ }
}

// ── Provider info ───────────────────────────────────────────────────

interface ProviderInfo { id: string; name: string; baseURL: string; defaultModel: string; }
const PRESETS: Record<string, ProviderInfo> = {
  anthropic: { id: 'anthropic', name: 'Anthropic', baseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-6' },
  openai: { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-v4-pro' },
  google: { id: 'google', name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-pro' },
  ollama: { id: 'ollama', name: 'Ollama', baseURL: 'http://localhost:11434/v1', defaultModel: 'codellama' },
  'azure-openai': { id: 'azure-openai', name: 'Azure OpenAI', baseURL: '', defaultModel: 'gpt-4o' },
  moonshot: { id: 'moonshot', name: 'Kimi', baseURL: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.7-code' },
  zhipu: { id: 'zhipu', name: 'GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5.1' },
  minimax: { id: 'minimax', name: 'MiniMax', baseURL: 'https://api.minimaxi.com/v1', defaultModel: 'MiniMax-M2.7' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o' },
  siliconflow: { id: 'siliconflow', name: 'SiliconFlow', baseURL: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V3' },
};
function getProviderInfo(id: string): ProviderInfo | undefined { return PRESETS[id]; }

// ── Adapter ──────────────────────────────────────────────────────────

let _handler: ((m: ExtensionMessage) => void) | null = null;
let _initSent = false;

export const tauriAdapter: IPlatformAdapter = {
  postMessage(msg: WebViewMessage): void {
    console.log('[TauriAdapter]', msg.type); wlog('info', `→ ${msg.type}`);
    switch (msg.type) {
      case 'config.get': enqueueInit(); break;
      case 'config.set': {
        const p = (msg as any).payload || {};
        if (p.provider) { const preset = getProviderInfo(p.provider); _config.provider = p.provider; _config.chatModel = p.chatModel || preset?.defaultModel || _config.chatModel; _config.baseURL = p.baseURL !== undefined ? p.baseURL : (preset?.baseURL || _config.baseURL); }
        else if (p.chatModel) _config.chatModel = p.chatModel;
        if (p.baseURL !== undefined) _config.baseURL = p.baseURL;
        _config.displayProvider = _config.provider + ' (Desktop)'; persistConfig();
        if (_handler) _handler({ type: 'config.state', payload: { ..._config } });
        break;
      }
      case 'config.setKey': {
        const pk = (msg as any).payload || {}; const ex = _apiKeys.find(k => k.providerId === pk.providerId);
        if (ex) ex.apiKey = pk.apiKey; else _apiKeys.push({ providerId: pk.providerId, apiKey: pk.apiKey });
        if (_invoke) _invoke('cmd_set_config', { key: `apiKey.${pk.providerId}`, value: pk.apiKey }).catch(() => {});
        break;
      }
      case 'models.fetch': (async () => { const key = _apiKeys.find(k => k.providerId === _config.provider)?.apiKey || ''; try { const res = await fetch(`${_config.baseURL.replace(/\/+$/, '')}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10000) }); if (res.ok) { const data = await res.json() as any; const list = (data.data || data.models || []).map((m: any) => ({ id: m.id || m.name?.replace('models/', '') || '', name: m.name || m.id || '' })).filter((m: any) => m.id); if (_handler) _handler({ type: 'models.list', payload: { models: list, sourceUrl: _config.baseURL } }); } } catch { /* */ } })(); break;
      case 'session.list': if (_handler) _handler({ type: 'session.list', payload: { sessions: _sessions } }); break;
      case 'session.create': { const id = `d-${Date.now()}`; _sessions.push({ id, title: 'New Chat', messageCount: 0, updatedAt: Date.now() }); if (_handler) _handler({ type: 'session.list', payload: { sessions: _sessions } }); break; }
      case 'session.delete': { const sid = (msg as any).payload?.sessionId; if (sid) _sessions = _sessions.filter(s => s.id !== sid); if (_handler) _handler({ type: 'session.list', payload: { sessions: _sessions } }); break; }
      case 'chat.send': handleChatSend((msg as any).payload?.content || ''); break;
      case 'chat.cancel': _abortController?.abort(); _abortController = null; break;
      case 'chat.clear': _chatHistory = []; if (_handler) _handler({ type: 'chat.clear' } as ExtensionMessage); break;
      case 'context.refresh': loadWorkspace(); break;
      default: if ((msg as any).type === 'workspace.pick') pickFolder(); break;
    }
  },
  onMessage(handler: (m: ExtensionMessage) => void): () => void {
    _handler = handler; initTauri();
    setTimeout(() => { if (_handler === handler) sendInit(handler); }, 10);
    return () => { _handler = null; };
  },
};

function enqueueInit(): void { if (_handler) sendInit(_handler); }
function sendInit(h: (m: ExtensionMessage) => void): void {
  if (_initSent) return; _initSent = true;
  loadWorkspace().then(() => { if (h === _handler) h({ type: 'context.update', payload: { openFiles: [], projectFiles: _projectFiles.length, diagnosticsCount: 0, hasRules: !!_rulesContent, workspaceRoot: _workspaceRoot } }); });
  h({ type: 'config.state', payload: { ..._config } });
  h({ type: 'session.list', payload: { sessions: _sessions } });
  h({ type: 'chat.state', payload: { messages: [] } });
}

// ── Workspace ────────────────────────────────────────────────────────

async function loadWorkspace(): Promise<void> {
  if (!_invoke) return;
  try { _workspaceRoot = (await _invoke('cmd_get_workspace')) as string; const s = await _invoke('cmd_scan_project') as { files: ProjectEntry[] }; _projectFiles = s.files || []; const r = await _invoke('cmd_read_rules') as string | null; _rulesContent = r || ''; } catch { /* */ }
}

async function pickFolder(): Promise<void> {
  if (!_invoke) { await initTauri(); if (!_invoke) { alert('Folder picker requires the desktop app.'); return; } }
  try { const f = await _invoke('cmd_pick_folder') as string | null; if (f) { await _invoke('cmd_set_workspace', { path: f }); _workspaceRoot = f; await loadWorkspace(); _chatHistory = []; if (_handler) _handler({ type: 'context.update', payload: { openFiles: [], projectFiles: _projectFiles.length, diagnosticsCount: 0, hasRules: !!_rulesContent, workspaceRoot: _workspaceRoot } }); } } catch (e: any) { alert('Failed: ' + (e?.message || e)); }
}

// ── Tool Execution ──────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  if (!_invoke) return 'Error: No workspace. Open a folder first.';
  try {
    switch (name) {
      case 'read_file': { const p = args.path || args.filePath || ''; if (!p) return 'Error: path required.'; let c = await _invoke('cmd_read_file_workspace', { relativePath: p }) as string; const sl = parseInt(args.startLine || '0'), el = parseInt(args.endLine || '0'); if (sl && el) { const ls = c.split('\n'); c = ls.slice(sl - 1, el).join('\n'); return `(lines ${sl}-${el}/${ls.length})\n${c}`; } return c.length > 50000 ? c.substring(0, 50000) + `\n...(truncated, ${c.length} chars)` : c; }
      case 'write_file': { const p = args.path || args.filePath || '', c = args.content || ''; if (!p) return 'Error: path required.'; await _invoke('cmd_write_file_workspace', { relativePath: p, content: c }); return `Wrote ${c.split('\n').length} lines to "${p}".`; }
      case 'edit_file': { const p = args.path || args.filePath || '', os = args.old_string || args.oldString || '', ns = args.new_string || args.newString || ''; if (!p || !os) return 'Error: path and old_string required.'; const orig = await _invoke('cmd_read_file_workspace', { relativePath: p }) as string; const nor = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const no = nor(orig), noo = nor(os); let idx = orig.indexOf(os); if (idx === -1) idx = no.indexOf(noo); if (idx === -1) { const fl = noo.split('\n')[0] || ''; let hint = ''; for (const l of no.split('\n')) { if (l.trim() && l.includes(fl.trim().substring(0, 10))) { hint = ` Did you mean: "${l.trim().substring(0, 80)}"?`; break; } } return `Error: old_string not found.${hint}`; } const al = noo.length; if (no.substring(idx + al).includes(noo)) return 'Error: old_string matches multiple locations.'; const crlf = orig.includes('\r\n'); const edited = no.substring(0, idx) + nor(ns) + no.substring(idx + al); const final = crlf ? edited.replace(/\n/g, '\r\n') : edited; await _invoke('cmd_write_file_workspace', { relativePath: p, content: final }); const cl = (final.match(/\n/g) || []).length - (orig.match(/\n/g) || []).length; return `Edited "${p}": ${os.length}→${ns.length} chars${cl !== 0 ? ` (${cl > 0 ? '+' : ''}${cl} lines)` : ''}.`; }
      case 'list_directory': { const d = args.path || args.directoryPath || ''; const entries = await _invoke('cmd_list_dir_workspace', { relativePath: d || null }) as Array<[string, boolean]>; return entries.length === 0 ? '(empty)' : entries.map(([n, isDir]) => `${isDir ? '📁' : '📄'} ${n}${isDir ? '/' : ''}`).join('\n'); }
      case 'search_files': { const pat = args.pattern || ''; if (!pat) return 'Error: pattern required.'; const r = await _invoke('cmd_search_content', { pattern: pat, maxResults: 20 }) as string[]; return r.join('\n'); }
      case 'execute_command': { const cmd = args.command || '', cwd = args.working_directory || args.workingDirectory || _workspaceRoot; if (!cmd) return 'Error: command required.'; if (/rm\s+-rf\s+\/|sudo\s+rm|>\/dev\/sd/.test(cmd)) return 'Blocked: dangerous command.'; const r = await _invoke('cmd_execute_command', { command: cmd, cwd, timeoutMs: 30000 }) as { stdout: string; stderr: string; exit_code: number; killed: boolean }; if (r.killed) return `Timed out.\n${r.stdout}`; return [r.stdout, r.stderr ? '\n[stderr]\n' + r.stderr : ''].filter(Boolean).join('').substring(0, 5000) || '(no output)'; }
      default: return `Unknown tool: ${name}`;
    }
  } catch (e: any) { return `Error: ${e?.message || e}`; }
}

// ── Chat Engine (Native Tool Calling) ────────────────────────────────

async function handleChatSend(content: string): Promise<void> {
  if (!_handler) return;
  const apiKey = _apiKeys.find(k => k.providerId === _config.provider)?.apiKey || '';
  if (!apiKey && _config.provider !== 'ollama') { _handler({ type: 'chat.error', payload: { message: 'No API key configured.', code: 'NO_API_KEY' } } as ExtensionMessage); return; }

  _chatHistory.push({ role: 'user', content });
  _handler({ type: 'chat.started', payload: {} } as ExtensionMessage);
  _abortController = new AbortController();

  try {
    for (let turn = 0; turn < 5; turn++) {
      const msgs: Message[] = [{ role: 'system', content: buildSystemPrompt() }, ..._chatHistory];
      const config = { apiKey, baseURL: _config.baseURL, model: _config.chatModel, maxTokens: _config.maxTokens || 4096, thinkingBudget: 0, provider: _config.provider };

      let text = '';
      const result = await streamChat(config, msgs, TOOL_DEFS, (t) => { text += t; _handler!({ type: 'chat.token', payload: { text: t } } as ExtensionMessage); }, _abortController.signal);

      if (!result.toolCalls?.length) {
        _chatHistory.push({ role: 'assistant', content: text });
        _handler({ type: 'chat.done', payload: { usage: result.usage || { inputTokens: 0, outputTokens: 0 } } } as ExtensionMessage);
        return;
      }

      for (const tc of result.toolCalls) {
        const tid = tc.id || `${Date.now()}-${Math.random()}`;
        const dn = tc.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const args = tc.args as Record<string, string>;
        _handler({ type: 'chat.toolCall', payload: { id: tid, name: tc.name, displayName: dn, args, needsApproval: false } } as ExtensionMessage);

        let diff: LocalDiff | undefined;
        if ((tc.name === 'write_file' || tc.name === 'edit_file') && args.path) {
          try {
            const orig = await _invoke?.('cmd_read_file_workspace', { relativePath: args.path }) as string;
            const r = await executeTool(tc.name, args);
            const newC = await _invoke?.('cmd_read_file_workspace', { relativePath: args.path }) as string;
            diff = simpleDiff(args.path, orig || '', newC || '');
            _handler({ type: 'chat.toolResult', payload: { id: tid, name: tc.name, result: r, success: !r.startsWith('Error'), diff: diff as any } } as ExtensionMessage);
            continue;
          } catch { /* */ }
        }

        const r = await executeTool(tc.name, args);
        _handler({ type: 'chat.toolResult', payload: { id: tid, name: tc.name, result: r, success: !r.startsWith('Error') } } as ExtensionMessage);
      }

      const tmsgs: Message[] = [];
      for (const tc of result.toolCalls) {
        const execResult = await executeTool(tc.name, tc.args as Record<string, string>);
        tmsgs.push({ role: 'tool' as const, content: execResult, toolCallId: tc.id || Date.now().toString() });
      }
      _chatHistory.push({ role: 'assistant', content: text, toolCalls: result.toolCalls }, ...tmsgs);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    _handler({ type: 'chat.error', payload: { message: err?.message || 'Unknown error', code: 'CHAT_ERROR' } } as ExtensionMessage);
  } finally {
    _abortController = null;
    _handler({ type: 'chat.done', payload: { usage: { inputTokens: 0, outputTokens: 0 } } } as ExtensionMessage);
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function getDesktopLogPath(): Promise<string> { if (!_invoke) return ''; try { return await _invoke('cmd_get_log_path') as string; } catch { return ''; } }
export async function getDesktopLogStats(): Promise<{ path: string; size: number } | null> { if (!_invoke) return null; try { return await _invoke('cmd_get_log_stats') as { path: string; size: number }; } catch { return null; } }
