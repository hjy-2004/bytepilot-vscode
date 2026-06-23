import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logInfo, logError } from '../utils/logger';
import type { WebViewMessage, ExtensionMessage } from '../types/ipc';

/**
 * Manages the Chat WebView panel lifecycle and IPC.
 */
export class ChatPanel {
  public static readonly viewType = 'aiCodingAgent.chatPanel';
  private static currentPanel: ChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  /** Callback for messages received from the WebView. */
  private onMessageCallback?: (message: WebViewMessage) => void;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(() => {
      if (this.panel.visible) {
        this.sendContextUpdate();
      }
    }, null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: WebViewMessage) => {
        if (this.onMessageCallback) {
          this.onMessageCallback(message);
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.html = this.getHtml();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    onMessage?: (message: WebViewMessage) => void
  ): ChatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      if (onMessage) {
        ChatPanel.currentPanel.onMessageCallback = onMessage;
      }
      return ChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      'AI Chat',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist'),
        ],
      }
    );

    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'light', 'chat.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'dark', 'chat.svg'),
    };

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
    if (onMessage) {
      ChatPanel.currentPanel.onMessageCallback = onMessage;
    }
    return ChatPanel.currentPanel;
  }

  public static current(): ChatPanel | undefined {
    return ChatPanel.currentPanel;
  }

  public onMessage(callback: (message: WebViewMessage) => void): void {
    this.onMessageCallback = callback;
  }

  public postMessage(message: ExtensionMessage): void {
    this.panel.webview.postMessage(message);
  }

  public sendChatToken(text: string): void {
    this.postMessage({ type: 'chat.token', payload: { text } });
  }

  public sendToolCall(id: string, name: string, displayName: string, args: Record<string, unknown>): void {
    this.postMessage({
      type: 'chat.toolCall',
      payload: { id, name, displayName, args },
    });
  }

  public sendToolResult(id: string, name: string, result: string, success: boolean): void {
    this.postMessage({
      type: 'chat.toolResult',
      payload: { id, name, result, success },
    });
  }

  public sendDone(usage?: { inputTokens: number; outputTokens: number }): void {
    this.postMessage({ type: 'chat.done', payload: { usage } });
  }

  public sendError(message: string, code?: string): void {
    this.postMessage({ type: 'chat.error', payload: { message, code } });
  }

  public sendConfigState(config: {
    provider: string;
    chatModel: string;
    completionModel: string;
    temperature: number;
    maxTokens: number;
    completionsEnabled: boolean;
    availableModels: { id: string; name: string }[];
  }): void {
    this.postMessage({ type: 'config.state', payload: config });
  }

  public sendToolApprovalRequest(
    toolCallId: string,
    toolName: string,
    displayName: string,
    args: Record<string, unknown>
  ): void {
    this.postMessage({
      type: 'tool.requestApproval',
      payload: { toolCallId, toolName, displayName, args },
    });
  }

  private sendContextUpdate(): void {
    // TODO: integrate with ContextCollector in Phase 5
    this.postMessage({
      type: 'context.update',
      payload: { openFiles: [], projectFiles: 0, diagnosticsCount: 0 },
    });
  }

  private getHtml(): string {
    // In production, load the bundled webview JS from webview-ui/dist
    const webviewDistPath = path.join(this.extensionUri.fsPath, 'webview-ui', 'dist');

    let scriptUri: vscode.Uri;
    let styleUri: vscode.Uri | undefined;

    // Check for Vite-built files first
    const assetsDir = path.join(webviewDistPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      const jsFile = files.find(f => f.endsWith('.js'));
      const cssFile = files.find(f => f.endsWith('.css'));
      if (jsFile) {
        scriptUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', jsFile);
      }
      if (cssFile) {
        styleUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', cssFile);
      }
    }

    // Fallback: use dev index.html approach
    const indexPath = path.join(webviewDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      // Replace relative paths with webview URIs
      const webviewUri = this.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist')
      );
      return html.replace(
        /(src|href)="\.?\/(assets\/[^"]+)"/g,
        (_, attr, filePath) => `${attr}="${webviewUri}${filePath}"`
      );
    }

    // Minimal fallback HTML if webview hasn't been built yet
    // (useful during initial development)
    scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'index.html')
    );

    const csp = this.panel.webview.cspSource;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; script-src ${csp}; font-src ${csp}; connect-src ${csp};">
  ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
  <title>BytePilot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh; overflow: hidden; padding: 0;
    }
    #root { height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    ChatPanel.currentPanel = undefined;
    this.onMessageCallback = undefined;
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.panel.dispose();
  }
}
