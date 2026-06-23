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
    const webviewDistPath = path.join(this.extensionUri.fsPath, 'webview-ui', 'dist');
    logInfo(`ChatPanel getHtml: distPath=${webviewDistPath}, exists=${fs.existsSync(webviewDistPath)}`);

    let scriptUri: vscode.Uri;
    let styleUri: vscode.Uri | undefined;

    const assetsDir = path.join(webviewDistPath, 'assets');
    const assetsExist = fs.existsSync(assetsDir);
    logInfo(`ChatPanel assets: ${assetsDir}, exists=${assetsExist}`);
    if (assetsExist) {
      const files = fs.readdirSync(assetsDir);
      logInfo(`ChatPanel assets files: ${files.join(', ')}`);
      const jsFile = files.find(f => f.endsWith('.js'));
      const cssFile = files.find(f => f.endsWith('.css'));
      if (jsFile) {
        scriptUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', jsFile);
        logInfo(`ChatPanel scriptUri from assets: ${scriptUri.toString()}`);
      }
      if (cssFile) {
        styleUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', cssFile);
        logInfo(`ChatPanel styleUri from assets: ${styleUri.toString()}`);
      }
    }

    const indexPath = path.join(webviewDistPath, 'index.html');
    logInfo(`ChatPanel index.html: ${indexPath}, exists=${fs.existsSync(indexPath)}`);
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      // Replace absolute asset paths with webview URIs
      return html.replace(
        /(src|href)="\/assets\/([^"]+)"/g,
        (_, attr, file) => {
          const uri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', file)
          );
          return `${attr}="${uri}"`;
        }
      );
    }

    // Minimal fallback HTML if webview hasn't been built yet
    // (useful during initial development)
    scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'index.html')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src ${this.panel.webview.cspSource}; font-src ${this.panel.webview.cspSource};">
  ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
  <title>AI Chat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      overflow: hidden;
      padding: 0;
    }
    #root { height: 100%; }
    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="root"><div class="placeholder">AI Coding Agent loading...</div></div>
  <script src="${scriptUri}"></script>
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
