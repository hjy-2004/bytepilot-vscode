/**
 * BytePilot Tauri Sidecar Entry Point.
 *
 * This process is spawned by the Tauri Rust backend and runs the core AI engine.
 * It communicates with the Rust backend via JSON-RPC over stdin/stdout.
 *
 * Protocol (JSON-RPC 2.0, newline-delimited):
 *   → {"jsonrpc":"2.0","id":1,"method":"chat.send","params":{...}}
 *   ← {"jsonrpc":"2.0","id":1,"result":{...}}
 *   ← {"jsonrpc":"2.0","method":"chat.token","params":{"text":"..."}}  (notification)
 */

import { ChatEngine } from '@bytepilot/core';
import { ToolRegistry, buildTool } from '@bytepilot/core';
import { setCoreLogger, type ILogger } from '@bytepilot/core';
import type { PlatformContext } from '@bytepilot/core';
import { TauriFileSystem } from './platform/tauri-filesystem';
import { TauriConfigStore } from './platform/tauri-config';
import { TauriEditorHost } from './platform/tauri-editor';

// ── JSON-RPC Transport ──────────────────────────────────────────────

interface RpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Logger ──────────────────────────────────────────────────────────

const logger: ILogger = {
  info(msg) { sendNotification('log', { level: 'info', message: msg }); },
  error(msg, err) {
    sendNotification('log', {
      level: 'error',
      message: msg,
      error: err instanceof Error ? err.message : String(err || ''),
    });
  },
  warn(msg) { sendNotification('log', { level: 'warn', message: msg }); },
  debug(msg) { sendNotification('log', { level: 'debug', message: msg }); },
  show(_preserveFocus?: boolean) { /* no-op in sidecar */ },
};

setCoreLogger(logger);

// ── RPC Helpers ─────────────────────────────────────────────────────

let rpcIdCounter = 0;

function sendNotification(method: string, params: Record<string, unknown>): void {
  const msg: RpcResponse & { method: string; params: unknown } = {
    jsonrpc: '2.0',
    method,
    params,
  };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResponse(id: number | string, result: unknown): void {
  const msg: RpcResponse = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendError(id: number | string, code: number, message: string): void {
  const msg: RpcResponse = { jsonrpc: '2.0', id, error: { code, message } };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function rpcInvoke(method: string, args?: Record<string, unknown>): Promise<unknown> {
  // For the sidecar, we simulate invoke by calling local functions
  // In production, this could forward to the Rust backend via another RPC channel
  return Promise.reject(new Error(`Sidecar cannot invoke Rust commands directly. Use Tauri adapter in webview.`));
}

// ── Engine State ────────────────────────────────────────────────────

let engine: ChatEngine | null = null;
let toolRegistry: ToolRegistry | null = null;

async function getWorkspaceRoot(): Promise<string> {
  // Default to current working directory
  return process.cwd();
}

// ── RPC Handler ─────────────────────────────────────────────────────

async function handleRpc(req: RpcRequest): Promise<void> {
  const { id, method, params } = req;

  try {
    switch (method) {
      case 'initialize': {
        const wsRoot = (params?.workspaceRoot as string) || process.cwd();
        const fs = new TauriFileSystem(rpcInvoke);
        const config = new TauriConfigStore(rpcInvoke);
        const editor = new TauriEditorHost(rpcInvoke, wsRoot);

        // Build tool registry with standard tools
        // In production, these would be imported from @bytepilot/core tools
        toolRegistry = new ToolRegistry();
        // toolRegistry.registerAll([...]);

        // Create the chat engine
        // In production, this would use the actual AI model from config
        logger.info(`Sidecar initialized. Workspace: ${wsRoot}`);
        if (id !== undefined) sendResponse(id, { status: 'ok', workspaceRoot: wsRoot });
        break;
      }

      case 'chat.send': {
        if (!engine) {
          sendError(id || 0, -1, 'Engine not initialized. Call "initialize" first.');
          return;
        }
        const content = params?.content as string;
        if (!content) {
          sendError(id || 0, -2, 'Missing "content" parameter.');
          return;
        }
        // engine.sendMessage(content);
        sendNotification('chat.started', {});
        sendNotification('chat.token', { text: `Echo: ${content}\n\n(Tauri sidecar is running — full AI integration requires model configuration.)` });
        sendNotification('chat.done', {});
        if (id !== undefined) sendResponse(id, { status: 'ok' });
        break;
      }

      case 'chat.cancel': {
        engine?.cancel();
        if (id !== undefined) sendResponse(id, { status: 'ok' });
        break;
      }

      case 'ping': {
        if (id !== undefined) sendResponse(id, { pong: true, timestamp: Date.now() });
        break;
      }

      default:
        sendError(id || 0, -32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    sendError(id || 0, -32603, err.message || 'Internal error');
  }
}

// ── Main Loop ───────────────────────────────────────────────────────

function main(): void {
  logger.info('BytePilot sidecar starting...');

  let buffer = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        // Handle both JSON-RPC and Tauri invoke format
        const msg = JSON.parse(trimmed);
        if (msg.jsonrpc === '2.0' && msg.method) {
          handleRpc(msg as RpcRequest);
        } else if (msg.cmd) {
          // Tauri sidecar invoke format
          handleRpc({
            jsonrpc: '2.0',
            id: msg.id || rpcIdCounter++,
            method: msg.cmd,
            params: msg.args,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  });

  process.stdin.on('end', () => {
    logger.info('BytePilot sidecar shutting down.');
    process.exit(0);
  });

  // Heartbeat
  setInterval(() => {
    sendNotification('heartbeat', { timestamp: Date.now() });
  }, 30000);
}

main();
