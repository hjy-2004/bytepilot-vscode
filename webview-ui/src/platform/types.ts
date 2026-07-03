/**
 * Platform adapter interface for the webview UI.
 * Each platform (VS Code, Tauri desktop) implements this to abstract
 * how messages are sent to and received from the backend.
 */
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';

export interface IPlatformAdapter {
  /** Send a message from the webview to the backend. */
  postMessage(message: WebViewMessage): void;

  /** Subscribe to messages from the backend. Returns an unsubscribe function. */
  onMessage(handler: (message: ExtensionMessage) => void): () => void;
}
