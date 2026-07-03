/**
 * Platform-aware hook that replaces useVSCode/useOnExtensionMessage.
 *
 * Auto-detects the runtime environment:
 *   - VS Code webview  → uses vscodeAdapter (postMessage / window message events)
 *   - Tauri desktop     → uses tauriAdapter (invoke / event listen)
 *
 * Components import { usePlatform } and call postMessage / onMessage.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { IPlatformAdapter } from '../platform/types';
import { vscodeAdapter } from '../platform/vscode-adapter';
import { tauriAdapter } from '../platform/tauri-adapter';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';

let _adapter: IPlatformAdapter | null = null;

function detectAdapter(): IPlatformAdapter {
  if (_adapter) return _adapter;

  // Detect Tauri: check multiple Tauri-specific globals
  // Tauri v2 uses __TAURI_INTERNALS__; v1 uses __TAURI__
  if (typeof window !== 'undefined') {
    const w = window as any;
    if (w.__TAURI_INTERNALS__ || w.__TAURI__) {
      _adapter = tauriAdapter;
      return _adapter;
    }
    // Also check: no acquireVsCodeApi means we're not in VS Code
    if (typeof w.acquireVsCodeApi === 'undefined') {
      console.log('[usePlatform] No VS Code API detected, defaulting to Tauri adapter');
      _adapter = tauriAdapter;
      return _adapter;
    }
  }

  _adapter = vscodeAdapter;
  return _adapter;
}

/** Explicitly set the adapter (for testing or forced mode). */
export function setPlatformAdapter(adapter: IPlatformAdapter): void {
  _adapter = adapter;
}

export function usePlatform() {
  const adapter = useMemo(() => detectAdapter(), []);

  const postMessage = useCallback((message: WebViewMessage) => {
    adapter.postMessage(message);
  }, [adapter]);

  const onMessage = useCallback(
    (handler: (message: ExtensionMessage) => void) => {
      return adapter.onMessage(handler);
    },
    [adapter],
  );

  return { postMessage, onMessage };
}

/**
 * Drop-in replacement for useOnExtensionMessage.
 * Automatically manages subscription lifecycle.
 */
export function useOnMessage(handler: (message: ExtensionMessage) => void): void {
  const adapter = useMemo(() => detectAdapter(), []);

  useEffect(() => {
    const unsubscribe = adapter.onMessage(handler);
    return unsubscribe;
  }, [adapter, handler]);
}
