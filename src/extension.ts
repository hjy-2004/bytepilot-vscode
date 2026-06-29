import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ChatPanel } from './chat/panel';
import { DisposableStore } from './utils/disposable';
import { logInfo, logError, disposeLogger, getLogger, showLogger } from './utils/logger';
import { setDevMode } from './utils/ai-logger';
import { ProviderManager } from './ai/provider-manager';
import { SecretsStore } from './ai/secrets-store';
import { ChatEngine } from './ai/chat-engine';
import { ToolRegistry } from './tools/registry';
import { MessageRouter } from './chat/router';
import { getConfigState } from './config/settings';
import { ContextCollector } from './context/collector';
import { generateText } from 'ai';
import { InlineCompletionProvider } from './completion/inline-provider';
import { CompletionEngine } from './ai/completion-engine';
import { loadSessionMessages, createSession, listSessions } from './chat/history';
import { interactiveImport, scanKnownLocations, importCachedConfig } from './config/importer';
import type { WebViewMessage } from './types/ipc';

// Tool imports
import { readFileTool } from './tools/read-file';
import { writeFileTool } from './tools/write-file';
import { searchFilesTool } from './tools/search-files';
import { listDirectoryTool } from './tools/list-directory';
import { executeCommandTool } from './tools/execute-command';
import { readDiagnosticsTool } from './tools/read-diagnostics';
import { editFileTool } from './tools/edit-file';
import { diffFileTool } from './tools/diff-file';

let disposables: DisposableStore;
let providerManager: ProviderManager;
let toolRegistry: ToolRegistry;
let messageRouter: MessageRouter;
let chatEngine: ChatEngine | null = null;
let contextCollector: ContextCollector;
let inlineProvider: InlineCompletionProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  setDevMode(context.extensionMode === vscode.ExtensionMode.Development);
  logInfo('AI Coding Agent activating...');
  // Show output channel immediately in debug mode so user sees startup logs
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    showLogger();
  }
  disposables = new DisposableStore();

  // --- Context Collector ---
  contextCollector = new ContextCollector();

  // --- Secrets & Provider ---
  const secretsStore = new SecretsStore(context.secrets);
  disposables.add(secretsStore);

  providerManager = new ProviderManager(secretsStore);
  disposables.add(providerManager);
  await providerManager.initialize();

  // --- Tools ---
  toolRegistry = new ToolRegistry();
  toolRegistry.registerAll([
    readFileTool as any,
    writeFileTool as any,
    editFileTool as any,
    searchFilesTool as any,
    listDirectoryTool as any,
    executeCommandTool as any,
    readDiagnosticsTool as any,
    diffFileTool as any,
  ]);

  // Set workspace context for tools
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  toolRegistry.setExecutionContext({
    workspaceRoot: workspaceFolder,
    signal: new AbortController().signal,
  });

  // --- Message Router (must be created BEFORE ChatEngine) ---
  messageRouter = new MessageRouter(
    toolRegistry,
    () => interactiveImport(secretsStore),
    () => vscode.commands.executeCommand('aiCodingAgent.configureProvider'),
    async (sourcePath: string) => {
      const imported = await importCachedConfig(sourcePath, secretsStore);
      if (imported) {
        await providerManager.reload();
      }
    },
    () => {
      try {
        const model = providerManager.getChatModel();
        const cfg = getConfigState();
        const engine = new ChatEngine(model, toolRegistry, () => contextCollector.getContextString(), cfg.provider, cfg.baseURL, providerManager.getConfig()?.apiKey);
        engine.setWorkspacePath(getWorkspaceRoot());
        engine.setSessionIdProvider(() => messageRouter?.getActiveSession() || '');
        return engine;
      } catch { return null; }
    }
  );
  messageRouter.setSecretsStore(secretsStore);
  messageRouter.setCredentialsProvider(() => {
    const config = providerManager.getConfig();
    return {
      baseURL: config?.baseURL || '',
      apiKey: config?.apiKey || '',
    };
  });
  disposables.add(messageRouter);
  messageRouter?.onSwitchSession((sessionId: string) => {
    if (chatEngine) {
      chatEngine.clearHistory();
      const msgs = loadSessionMessages(getWorkspaceRoot(), sessionId);
      chatEngine.setHistory(msgs);
    }
  });

  // --- Chat Engine ---
  createChatEngine();

  // Listen for provider config changes to recreate engines.
  // We await providerManager.reload() FIRST, then recreate ChatEngine and
  // CompletionEngine so they always get the latest model.
  disposables.add(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('aiCodingAgent')) {
        await providerManager.reload();
        createChatEngine();
        updateCompletionEngine();
      }
    })
  );

  // --- Inline Completions ---
  inlineProvider = new InlineCompletionProvider();
  disposables.add(inlineProvider);
  updateCompletionEngine();

  disposables.add(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**/*' },
      inlineProvider
    )
  );

  // --- Chat History (loaded from disk in createChatEngine) ---

  // --- Sidebar WebView ---
  const chatViewProvider = new ChatViewProvider(context.extensionUri);
  disposables.add(
    vscode.window.registerWebviewViewProvider('aiCodingAgent.chatPanel', chatViewProvider)
  );

  // --- Commands ---
  registerCommands(context, secretsStore);

  logInfo('AI Coding Agent activated successfully.');
}

function createChatEngine(): void {
  try {
    const model = providerManager.getChatModel();
    const cfg = getConfigState();
    chatEngine = new ChatEngine(
      model,
      toolRegistry,
      () => contextCollector.getContextString(),
      cfg.provider,
      cfg.baseURL,
      providerManager.getConfig()?.apiKey,
    );
    const wsPath = getWorkspaceRoot();
    chatEngine.setWorkspacePath(wsPath);
    messageRouter?.setWorkspacePath(wsPath);

    // Get or create the active session
    const sessions = listSessions(wsPath);
    let activeSession = sessions[0];
    if (!activeSession) {
      activeSession = createSession(wsPath);
    }
    messageRouter?.setActiveSession(activeSession.id);
    chatEngine.setSessionIdProvider(() => messageRouter?.getActiveSession() || '');

    // Load persisted history from disk
    const savedHistory = loadSessionMessages(wsPath, activeSession.id);
    if (savedHistory.length > 0) {
      chatEngine.setHistory(savedHistory);
      logInfo(`Restored ${savedHistory.length} messages from session ${activeSession.id}`);
    }
    messageRouter?.setChatEngine(chatEngine);
  } catch (err) {
    logError('Failed to create chat engine', err);
  }
}

function updateCompletionEngine(): void {
  try {
    const model = providerManager.getCompletionModel();
    inlineProvider?.setEngine(new CompletionEngine(model));
    inlineProvider?.setApiKeyProvider(() => providerManager.getConfig()?.apiKey);
    inlineProvider?.setBaseURLProvider(() => providerManager.getConfig()?.baseURL);
    inlineProvider?.setProviderProvider(() => providerManager.getConfig()?.provider);
  } catch (err) {
    logError('Failed to create completion engine', err);
  }
}

function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

function handleWebViewMessage(message: WebViewMessage): void {
  // Update tool execution context with a fresh signal
  toolRegistry.setExecutionContext({
    workspaceRoot: getWorkspaceRoot(),
    signal: new AbortController().signal,
  });
  messageRouter.handle(message);
}

function registerCommands(context: vscode.ExtensionContext, secretsStore: SecretsStore): void {
  // Open chat
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.openChat', () => {
      const panel = ChatPanel.createOrShow(context.extensionUri, handleWebViewMessage);
      panel.sendConfigState(getConfigState());
    })
  );

  // New chat
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.newChat', () => {
      chatEngine?.clearHistory();
      ChatPanel.current()?.postMessage({ type: 'chat.clear' } as any);
      vscode.window.showInformationMessage('Started new chat session.');
    })
  );

  // Configure provider
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.configureProvider', async () => {
      const currentProvider = providerManager.getConfig()?.provider || 'anthropic';

      // Categorized provider list (from cc-switch knowledge base)
      interface ProviderQPItem extends vscode.QuickPickItem {
        value: string;
        category: string;
        defaultBaseURL?: string;
        defaultModel?: string;
      }

      const allProviders: ProviderQPItem[] = [
        // Official
        { label: 'Anthropic (Claude)', description: 'api.anthropic.com', value: 'anthropic', category: 'Official' },
        { label: 'OpenAI (GPT)', description: 'api.openai.com', value: 'openai', category: 'Official' },
        { label: 'Google (Gemini)', description: 'generativelanguage.googleapis.com', value: 'google', category: 'Official' },
        { label: 'Ollama (Local)', description: 'localhost:11434', value: 'ollama', category: 'Official', defaultModel: 'codellama' },
        { label: 'Azure OpenAI', description: '{resource}.openai.azure.com', value: 'azure-openai', category: 'Official' },
        // Chinese Official
        { label: 'DeepSeek', description: 'api.deepseek.com', value: 'deepseek', category: 'Chinese Official', defaultBaseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-v4-pro' },
        { label: 'Kimi (Moonshot)', description: 'api.moonshot.cn', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.7-code' },
        { label: 'Zhipu GLM', description: 'open.bigmodel.cn', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://open.bigmodel.cn/api/coding/paas/v4', defaultModel: 'glm-5.1' },
        { label: 'MiniMax', description: 'api.minimaxi.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://api.minimaxi.com/v1', defaultModel: 'MiniMax-M2.7' },
        { label: 'StepFun', description: 'api.stepfun.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://api.stepfun.com/step_plan/v1', defaultModel: 'step-3.5-flash-2603' },
        { label: 'Bailian (Alibaba)', description: 'dashscope.aliyuncs.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
        { label: 'Baidu Qianfan', description: 'qianfan.baidubce.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://qianfan.baidubce.com/anthropic/coding' },
        { label: 'Volcano AgentPlan', description: 'ark.cn-beijing.volces.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3', defaultModel: 'ark-code-latest' },
        { label: 'DouBao Seed', description: 'ark.cn-beijing.volces.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-seed-2-1-pro' },
        { label: 'Xiaomi MiMo', description: 'api.xiaomimimo.com', value: 'openai-compatible', category: 'Chinese Official', defaultBaseURL: 'https://api.xiaomimimo.com/v1', defaultModel: 'mimo-v2.5-pro' },
        // Aggregators
        { label: 'OpenRouter', description: 'openrouter.ai', value: 'openai-compatible', category: 'Aggregator', defaultBaseURL: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-sonnet-4.6' },
        { label: 'SiliconFlow', description: 'api.siliconflow.cn', value: 'openai-compatible', category: 'Aggregator', defaultBaseURL: 'https://api.siliconflow.cn/v1' },
        { label: 'AiHubMix', description: 'aihubmix.com', value: 'openai-compatible', category: 'Aggregator', defaultBaseURL: 'https://aihubmix.com' },
        { label: 'CherryIN', description: 'open.cherryin.net', value: 'openai-compatible', category: 'Aggregator', defaultBaseURL: 'https://open.cherryin.net' },
        { label: 'Shengsuanyun', description: 'router.shengsuanyun.com', value: 'openai-compatible', category: 'Aggregator', defaultBaseURL: 'https://router.shengsuanyun.com/api/v1' },
        // Generic
        { label: 'OpenAI Compatible (Generic)', description: 'Any OpenAI-compatible API', value: 'openai-compatible', category: 'Generic' },
      ];

      const selection = await vscode.window.showQuickPick(allProviders, {
        placeHolder: `Current: ${currentProvider}. Select AI provider`,
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!selection) return;

      const providerValue = selection.value;

      if (providerValue !== 'ollama') {
        const key = await vscode.window.showInputBox({
          prompt: `Enter your ${selection.label} API key (leave blank to keep existing)`,
          password: true,
          placeHolder: 'sk-... or ant-...',
        });
        if (key !== undefined && key !== '') {
          await secretsStore.setApiKey(providerValue as any, key);
        }
      }

      const cfg = vscode.workspace.getConfiguration('aiCodingAgent');
      await cfg.update('provider', providerValue, vscode.ConfigurationTarget.Global);

      // Auto-fill baseURL and model when selecting a preset provider
      if (selection.defaultBaseURL) {
        await cfg.update('baseURL', selection.defaultBaseURL, vscode.ConfigurationTarget.Global);
      }
      if (selection.defaultModel) {
        await cfg.update('chatModel', selection.defaultModel, vscode.ConfigurationTarget.Global);
      }

      vscode.window.showInformationMessage(
        `AI provider set to ${selection.label}. Configuration hot-reloaded.`
      );
    })
  );

  // Test provider
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.testProvider', async () => {
      try {
        const config = providerManager.getConfig();
        if (!config) {
          vscode.window.showErrorMessage('No provider configured. Run "Configure AI Provider" first.');
          return;
        }

        if (config.provider !== 'ollama' && !config.apiKey) {
          const key = await vscode.window.showInputBox({
            prompt: `Enter your ${config.provider} API key`,
            password: true,
            placeHolder: 'sk-... or ant-...',
          });
          if (key) {
            await secretsStore.setApiKey(config.provider, key);
            await providerManager.reload();
          } else {
            vscode.window.showWarningMessage('API key is required.');
            return;
          }
        }

        const model = providerManager.getChatModel();
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Testing AI connection...', cancellable: false },
          async () => {
            const start = Date.now();
            const result = await generateText({
              model,
              prompt: 'Say "Hello from AI Coding Agent!" in exactly one sentence.',
              maxTokens: 50,
              temperature: 0,
            });
            const elapsed = Date.now() - start;
            vscode.window.showInformationMessage(
              `AI connection OK (${elapsed}ms): "${result.text.trim()}"`
            );
          }
        );
      } catch (err) {
        logError('Provider test failed', err);
        vscode.window.showErrorMessage(
          `AI connection failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // Import config from other tools
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.importConfig', async () => {
      await interactiveImport(secretsStore);
      const panel = ChatPanel.current();
      if (panel) {
        setTimeout(() => panel.sendConfigState(getConfigState()), 500);
      }
    })
  );

  // Reset all configuration
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.resetConfig', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Reset all AI Coding Agent settings? This will clear provider, model, API key, and base URL.',
        { modal: true },
        'Reset'
      );
      if (confirm !== 'Reset') return;

      const config = vscode.workspace.getConfiguration('aiCodingAgent');
      await config.update('provider', undefined, vscode.ConfigurationTarget.Global);
      await config.update('chatModel', undefined, vscode.ConfigurationTarget.Global);
      await config.update('completionModel', undefined, vscode.ConfigurationTarget.Global);
      await config.update('baseURL', undefined, vscode.ConfigurationTarget.Global);

      // Clear all stored API keys
      for (const provider of ['openai', 'anthropic', 'ollama', 'deepseek', 'google', 'azure-openai'] as const) {
        await secretsStore.deleteApiKey(provider);
      }

      await providerManager.reload();
      const panel = ChatPanel.current();
      if (panel) {
        panel.sendConfigState(getConfigState());
      }
      vscode.window.showInformationMessage('AI Coding Agent configuration reset.');
    })
  );

  // Show current configuration for debugging
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.showConfig', async () => {
      const config = providerManager.getConfig();
      const apiKey = config?.apiKey;
      const claudePath = path.join(os.homedir(), '.claude', 'settings.json');
      const claudeExists = fs.existsSync(claudePath);

      const lines = [
        `Provider: ${config?.provider || 'N/A'}`,
        `Chat Model: ${config?.chatModel || 'N/A'}`,
        `Completion Model: ${config?.completionModel || 'N/A'}`,
        `Base URL: ${config?.baseURL || 'N/A'}`,
        `Temperature: ${config?.options?.temperature ?? 'N/A'}`,
        `Max Tokens: ${config?.options?.maxTokens ?? 'N/A'}`,
        `API Key set: ${apiKey ? 'YES' : 'NO'}`,
        `Claude config found: ${claudeExists ? 'YES (' + claudePath + ')' : 'NO'}`,
        ``,
        `Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'N/A'}`,
      ];

      // Try a quick test call
      if (apiKey && config?.chatModel) {
        try {
          const result = await generateText({
            model: providerManager.getChatModel(),
            messages: [{ role: 'user', content: 'Say hello' }],
            maxTokens: 50,
            temperature: 0,
          });
          lines.push(``, `Test call: SUCCESS - "${result.text.trim()}"`);
        } catch (err: any) {
          lines.push(``, `Test call: FAILED - ${err.message}`);
          if (err.cause) lines.push(`  Cause: ${JSON.stringify(err.cause)}`);
        }
      }

      const msg = lines.join('\n');
      vscode.window.showInformationMessage('Config shown in Output panel');
      logInfo('=== Current Configuration ===\n' + msg);
      getLogger().show();
    })
  );

  // Debug: check session files
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.debugSessions', async () => {
      const ws = getWorkspaceRoot();
      const dbgLines: string[] = [];
      const sessionDir = path.join(os.homedir(), '.ai-coding-agent', 'projects');
      dbgLines.push(`Session DB dir: ${sessionDir}`);
      dbgLines.push(`Workspace: ${ws}`);
      dbgLines.push(`Active session: ${messageRouter?.getActiveSession() || 'N/A'}`);
      dbgLines.push(`Dir exists: ${fs.existsSync(sessionDir)}`);
      if (fs.existsSync(sessionDir)) {
        const projectDirs = fs.readdirSync(sessionDir);
        dbgLines.push(`Project dirs: ${projectDirs.join(', ') || '(empty)'}`);
      }

      const sessions = listSessions(ws);
      dbgLines.push(`\nSessions found: ${sessions.length}`);
      for (const s of sessions) {
        const msgs = loadSessionMessages(ws, s.id);
        dbgLines.push(`  [${s.id}] "${s.title}" - ${msgs.length} msgs (meta: ${s.messageCount})`);
        if (msgs.length > 0) {
          dbgLines.push(`    First: ${msgs[0].role}: ${String(msgs[0].content).substring(0, 50)}`);
        }
      }
      const out = dbgLines.join('\n');
      vscode.window.showInformationMessage(`Found ${sessions.length} sessions. Check Output panel.`);
      logInfo('=== Session Debug ===\n' + out);
      getLogger().show();
    })
  );

  // Quick code commands
  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.explainCode', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
      }
      const text = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
      if (!text.trim()) {
        vscode.window.showWarningMessage('No code selected.');
        return;
      }
      const panel = ChatPanel.createOrShow(context.extensionUri, handleWebViewMessage);
      panel.sendConfigState(getConfigState());
      panel.postMessage({
        type: 'chat.send',
        payload: { content: `Please explain the following code:\n\`\`\`\n${text}\n\`\`\`` },
      } as any);
    })
  );

  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.fixCode', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
      }
      const text = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
      if (!text.trim()) {
        vscode.window.showWarningMessage('No code selected.');
        return;
      }
      const panel = ChatPanel.createOrShow(context.extensionUri, handleWebViewMessage);
      panel.sendConfigState(getConfigState());
      panel.postMessage({
        type: 'chat.send',
        payload: { content: `Please fix any issues in the following code:\n\`\`\`\n${text}\n\`\`\`` },
      } as any);
    })
  );

  disposables.add(
    vscode.commands.registerCommand('aiCodingAgent.generateCode', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe what code to generate',
        placeHolder: 'E.g., A React component that displays a user profile card',
      });
      if (!prompt) return;
      const panel = ChatPanel.createOrShow(context.extensionUri, handleWebViewMessage);
      panel.sendConfigState(getConfigState());
      panel.postMessage({
        type: 'chat.send',
        payload: { content: `Please generate code for the following:\n${prompt}` },
      } as any);
    })
  );
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private lastWebview: vscode.Webview | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    // Open the ChatPanel instead of showing a sidebar webview
    const panel = ChatPanel.createOrShow(this.extensionUri, handleWebViewMessage);
    panel.sendConfigState(getConfigState());
  }
}

export function deactivate(): void {
  logInfo('AI Coding Agent deactivating...');
  chatEngine?.cancel();
  // History is saved to disk after each message — no save needed here
  if (disposables) disposables.dispose();
  disposeLogger();
}
