/**
 * Tauri Platform Context — assembles Tauri implementations of all core interfaces.
 *
 * This is the desktop equivalent of what extension.ts does for VS Code.
 * Called by the React app at startup when running in Tauri.
 */
import type { PlatformContext, ILogger } from '@bytepilot/core';
import { setCoreLogger } from '@bytepilot/core';
import { TauriFileSystem } from './tauri-filesystem';
import { TauriConfigStore } from './tauri-config';
import { TauriEditorHost } from './tauri-editor';

export async function createTauriPlatformContext(): Promise<PlatformContext> {
  // Dynamically import Tauri APIs (only available in Tauri runtime)
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  const wsRoot = (await invoke('cmd_get_workspace_root')) as string;
  const fs = new TauriFileSystem(invoke);
  const config = new TauriConfigStore(invoke);
  await config.init();
  const editor = new TauriEditorHost(invoke, wsRoot);
  // API keys are stored in the OS keychain via the Rust `secrets` module,
  // never in the plaintext config.json.
  const secrets = {
    get: async (key: string) => {
      const v = (await invoke('cmd_secret_get', { key })) as string;
      return v ? v : undefined;
    },
    set: async (key: string, value: string) => { await invoke('cmd_secret_set', { key, value }); },
    delete: async (key: string) => { await invoke('cmd_secret_delete', { key }); },
    onDidChange: () => ({ dispose: () => {} }),
  };

  // Set up IPC via Tauri events
  const ipc = {
    sendToUI: (message: Record<string, unknown>) => {
      // Events go through the sidecar, not directly to UI
      // The webview listens to Tauri events for backend messages
    },
    onMessageFromUI: (handler: (message: Record<string, unknown>) => void) => {
      // Listen for messages from the webview
      const unlisten = listen('webview-message', (event) => {
        handler(event.payload as Record<string, unknown>);
      });
      return { dispose: unlisten as unknown as () => void };
    },
  };

  // Set up logger
  const logger: ILogger = {
    info: (msg) => console.log(`[BytePilot] ${msg}`),
    error: (msg, err) => console.error(`[BytePilot] ${msg}`, err),
    warn: (msg) => console.warn(`[BytePilot] ${msg}`),
    debug: (msg) => console.debug(`[BytePilot] ${msg}`),
    show: () => {},
  };
  setCoreLogger(logger);

  return { fs, secrets, config, logger, editor, ipc, workspaceRoot: wsRoot };
}
