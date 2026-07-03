/**
 * Tauri desktop platform adapter.
 *
 * Uses Tauri's invoke/event system for IPC between the webview and Rust backend.
 * Provides synthetic initialization to allow the UI to render without a backend sidecar.
 * Also wires up file-based logging via Rust cmd_write_log command.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';

let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

/** Attempt to load Tauri APIs for file logging. Falls back to console-only if unavailable. */
async function initTauriLogger(): Promise<void> {
  try {
    const mod = await import('@tauri-apps/api/core');
    _invoke = mod.invoke;
  } catch {
    console.log('[TauriAdapter] @tauri-apps/api not available, using console-only logging');
  }
}

async function writeLog(level: string, message: string, errorDetail?: string): Promise<void> {
  if (!_invoke) return;
  try {
    await _invoke('cmd_write_log', {
      level,
      message: message.substring(0, 2000),
      errorDetail: errorDetail?.substring(0, 2000) || null,
    });
  } catch { /* ignore write failures */ }
}

export const tauriAdapter: IPlatformAdapter = {
  postMessage(message: WebViewMessage): void {
    console.log('[BytePilot] postMessage:', message.type);
    writeLog('info', `WebView → Backend: ${message.type}`);

    if (message.type === 'config.get') {
      enqueueInitMessages();
    }
  },

  onMessage(handler: (message: ExtensionMessage) => void): () => void {
    console.log('[TauriAdapter] onMessage registered');
    initTauriLogger(); // fire-and-forget

    _handler = handler;
    setTimeout(() => {
      if (_handler === handler) {
        sendInitMessages(handler);
      }
    }, 10);
    return () => { _handler = null; };
  },
};

let _handler: ((message: ExtensionMessage) => void) | null = null;
let _initSent = false;

function enqueueInitMessages(): void {
  if (_handler) sendInitMessages(_handler);
}

function sendInitMessages(handler: (message: ExtensionMessage) => void): void {
  if (_initSent) return;
  _initSent = true;
  console.log('[TauriAdapter] Sending synthetic init messages');

  handler({
    type: 'config.state',
    payload: {
      provider: 'anthropic',
      chatModel: 'claude-sonnet-4-6',
      completionModel: '',
      temperature: 0.7,
      maxTokens: 4096,
      completionsEnabled: true,
      availableModels: [],
      initialized: true,
      displayProvider: 'Anthropic (Desktop)',
      baseURL: 'https://api.anthropic.com/v1',
    },
  });

  handler({
    type: 'session.list',
    payload: { sessions: [] },
  });

  handler({
    type: 'chat.state',
    payload: { messages: [] },
  });
}

/** Get log file path. Returns empty string if Tauri API not loaded. */
export async function getDesktopLogPath(): Promise<string> {
  if (!_invoke) return '';
  try {
    return (await _invoke('cmd_get_log_path')) as string;
  } catch {
    return '';
  }
}

/** Get log stats. Returns null if unavailable. */
export async function getDesktopLogStats(): Promise<{ path: string; size: number } | null> {
  if (!_invoke) return null;
  try {
    return (await _invoke('cmd_get_log_stats')) as { path: string; size: number };
  } catch {
    return null;
  }
}
