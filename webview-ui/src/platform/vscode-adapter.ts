/**
 * VS Code webview platform adapter.
 * Uses acquireVsCodeApi() for posting and window 'message' events for receiving.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';

let vsCodeApi: any = null;

function getApi() {
  if (!vsCodeApi) {
    vsCodeApi = (window as any).acquireVsCodeApi?.();
  }
  return vsCodeApi;
}

export const vscodeAdapter: IPlatformAdapter = {
  postMessage(message: WebViewMessage): void {
    const api = getApi();
    if (api) {
      api.postMessage(message);
    } else {
      console.warn('[WebView] VS Code API not available, message not sent:', message);
    }
  },

  onMessage(handler: (message: ExtensionMessage) => void): () => void {
    const listener = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      if (message && message.type) {
        handler(message);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  },
};
