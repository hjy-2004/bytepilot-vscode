import { useEffect, useCallback } from 'react';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';

// We import types with a relative path to the extension host types
// Vite will resolve this at build time

let vsCodeApi: any = null;

function getVsCodeApi() {
  if (!vsCodeApi) {
    vsCodeApi = (window as any).acquireVsCodeApi?.();
  }
  return vsCodeApi;
}

/**
 * Hook for communicating with the VS Code extension host.
 * Provides a typed `postMessage` sender and a `useOnMessage` listener.
 */
export function useVSCode() {
  const postMessage = useCallback((message: WebViewMessage) => {
    const api = getVsCodeApi();
    if (api) {
      api.postMessage(message);
    } else {
      console.warn('[WebView] VS Code API not available, message not sent:', message);
    }
  }, []);

  return { postMessage };
}

/**
 * Hook that listens for messages from the extension host.
 */
export function useOnExtensionMessage(
  handler: (message: ExtensionMessage) => void
): void {
  useEffect(() => {
    const listener = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      if (message && message.type) {
        handler(message);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handler]);
}
