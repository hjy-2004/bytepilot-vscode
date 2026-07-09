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

import {
  ToolRegistry,
  setCoreLogger,
  runAgentLoop,
  type ILogger,
  type ApiConfig,
  type IFileSystem,
  type IConfigStore,
  type Message,
} from '@bytepilot/core';
import { TauriFileSystem } from './platform/tauri-filesystem';
import { TauriConfigStore } from './platform/tauri-config';

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

// ── Engine State ────────────────────────────────────────────────────

let engine: ChatEngine | null = null;
let toolRegistry: ToolRegistry | null = null;
let workspaceRoot: string = process.cwd();

// ── RPC Handler ─────────────────────────────────────────────────────

async function handleRpc(req: RpcRequest): Promise<void> {
  const { id, method, params } = req;

  try {
    switch (method) {
      case 'initialize': {
        workspaceRoot = (params?.workspaceRoot as string) || process.cwd();
        const fs = new TauriFileSystem(rpcInvoke);
        const configStore = new TauriConfigStore(rpcInvoke);
        await configStore.init();

        // Build tool registry with standard tools
        toolRegistry = new ToolRegistry();

        // Set execution context for tools
        toolRegistry.setExecutionContext({
          workspaceRoot,
          signal: new AbortController().signal,
          fs,
          editor: {
            async getActiveFile(): Promise<string | null> { return null; },
            async getSelection(): Promise<{ path: string; selection: { startLine: number; startCol: number; endLine: number; endCol: number }; text: string } | null> { return null; },
            async openFile(_path: string, _line?: number): Promise<void> {},
            async getDiagnostics(_paths?: string[]): Promise<any[]> { return []; },
            async applyEdit(_path: string, _edits: Array<{ startLine: number; startCol: number; endLine: number; endCol: number; newText: string }>): Promise<boolean> { return false; },
          },
        });

        // Create the ChatEngine with provider config from Tauri config store
        const provider = configStore.get<string>('provider', 'anthropic');
        const chatModel = configStore.get<string>('chatModel', 'claude-sonnet-4-6');
        const baseURL = configStore.get<string>('baseURL', '');
        const maxTokens = configStore.get<number>('maxTokens', 4096);

        // The sidecar uses a direct API client (not the AI SDK LanguageModelV1)
        // so we create a lightweight engine wrapper that uses streamChat + runAgentLoop
        engine = createSidecarEngine(configStore, fs, workspaceRoot);

        logger.info(`Sidecar initialized. Workspace: ${workspaceRoot}, Provider: ${provider}, Model: ${chatModel}`);
        if (id !== undefined) sendResponse(id, { status: 'ok', workspaceRoot, provider, model: chatModel });
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
        const attachments = params?.attachments as any[] | undefined;
        try {
          await engine.sendMessage(content, undefined, attachments);
          if (id !== undefined) sendResponse(id, { status: 'ok' });
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            sendNotification('chat.error', { message: err?.message || String(err) || 'Chat failed' });
          }
          if (id !== undefined) sendResponse(id, { status: 'error', message: err?.message || String(err) });
        }
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
    sendError(id || 0, -32603, err?.message || String(err) || 'Internal error');
  }
}

// ── Sidecar Engine ──────────────────────────────────────────────────

/**
 * Creates a lightweight ChatEngine-like wrapper that uses the core
 * streamChat + runAgentLoop directly, wired to the sidecar's RPC transport.
 *
 * We don't use the full ChatEngine class because it depends on the AI SDK's
 * LanguageModelV1 interface; the sidecar uses raw HTTP API calls instead.
 */
function createSidecarEngine(
  configStore: IConfigStore,
  fs: IFileSystem,
  wsRoot: string,
) {
  let history: Message[] = [];
  let abortController: AbortController | null = null;

  return {
    async sendMessage(
      content: string,
      _onApproval?: any,
      attachments?: any[],
    ): Promise<void> {
      abortController?.abort();
      abortController = new AbortController();

      history.push({ role: 'user', content, attachments });

      const provider = configStore.get<string>('provider', 'anthropic');
      const apiConfig: ApiConfig = {
        apiKey: '',  // Will be read from Tauri config via env or config file
        baseURL: configStore.get<string>('baseURL', ''),
        model: configStore.get<string>('chatModel', 'claude-sonnet-4-6'),
        maxTokens: configStore.get<number>('maxTokens', 4096),
        thinkingBudget: configStore.get<number>('thinkingBudget', 4096),
        provider,
      };

      sendNotification('chat.started', {});

      try {
        await runAgentLoop(
          apiConfig,
          history,
          `You are an AI coding assistant integrated into BytePilot, a Tauri desktop app. You help developers write, understand, and debug code.

## Output formatting
- Use GitHub-flavored markdown for all responses: headings, lists, bold, inline code, code blocks, tables, etc.
- Directory trees, file listings, and box-drawing output (├ └ │ ─ etc.) MUST be wrapped in \`\`\` code fences so they render with monospace alignment. Example:
  \`\`\`
  ├── src/
  │   └── main.ts
  └── package.json
  \`\`\`
- Inline code and code blocks will be rendered in a monospace font.

## Available Tools
You have access to file and shell tools for reading, writing, searching code and executing commands.

## Workspace
The workspace root is: ${wsRoot}

## Guidelines
- Read files before editing them
- Use edit_file for existing files, write_file for new files
- Keep responses concise
- Follow the project's existing code style`,
          [],
          {
            onStarted: () => {},
            onToken: (text) => {
              sendNotification('chat.token', { text });
            },
            onToolCall: (id, name, displayName, args, needsApproval) => {
              sendNotification('chat.toolCall', { id, name, displayName, args, needsApproval });
            },
            onApprovalNeeded: async () => true, // Auto-approve in desktop for now
            onToolResult: (id, name, result, success) => {
              sendNotification('chat.toolResult', { id, name, result, success });
            },
            getDisplayName: (name) => name,
            executeTool: async (name, args) => {
              // Tools are executed via RPC back to the Rust backend
              try {
                const result = await rpcInvoke('tool.execute', { name, args });
                return { result: typeof result === 'string' ? result : JSON.stringify(result), success: true };
              } catch (e: any) {
                return { result: `Error: ${e?.message || e}`, success: false };
              }
            },
            isReadOnly: () => true, // Sidecar tools are all read-only until RPC is set up
          },
          500,
          abortController!.signal,
        );
      } finally {
        sendNotification('chat.done', {});
        abortController = null;
      }
    },

    cancel() {
      abortController?.abort();
    },

    clearHistory() {
      history = [];
    },

    getHistory() {
      return [...history];
    },

    setHistory(h: any[]) {
      history = h;
    },

    getIsGenerating() {
      return abortController !== null;
    },

    onStreamEvent(_cb: any) {
      // Not used in sidecar — we send RPC notifications directly
    },

    reconnectStream(_cb: any) {
      // Not used in sidecar
    },
  };
}

// ── Tool execution via RPC ──────────────────────────────────────────

let rpcIdCounter = 0;

function rpcInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  // Forward tool execution to the Rust backend via JSON-RPC notification
  // The Rust backend will call back with the result
  return new Promise((resolve, reject) => {
    const id = ++rpcIdCounter;
    // Send a request to the parent process (Rust backend)
    const msg = { jsonrpc: '2.0', id, method: cmd, params: args };
    process.stdout.write(JSON.stringify(msg) + '\n');
    // For now, resolve with empty — actual RPC round-trip would use
    // a pending request map and response matching
    resolve('ok');
  });
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
