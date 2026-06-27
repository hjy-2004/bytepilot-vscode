import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LanguageModelV1 } from 'ai';
import { createProvider } from './provider-factory';
import { SecretsStore } from './secrets-store';
import { readConfig, getConfigState } from '../config/settings';
import { validateConfig } from '../config/validator';
import { logInfo, logError } from '../utils/logger';
import { ChatPanel } from '../chat/panel';
import type { ProviderConfig } from '../types/ai';

/**
 * Central manager for AI provider lifecycle.
 * Owns provider instances and handles hot-reload when config changes.
 */
export class ProviderManager implements vscode.Disposable {
  private chatModel_: LanguageModelV1 | null = null;
  private completionModel_: LanguageModelV1 | null = null;
  private config_: (ProviderConfig & { apiKey?: string }) | null = null;
  private disposables: vscode.Disposable[] = [];
  private initialized = false;

  constructor(private readonly secretsStore: SecretsStore) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('aiCodingAgent')) {
          await this.reload();
        }
      })
    );

    this.disposables.push(
      secretsStore.onDidChange(async () => {
        await this.reload();
      })
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.reload();
    this.initialized = true;
  }

  async reload(): Promise<void> {
    try {
      const settingsConfig = readConfig();
      let apiKey = await this.secretsStore.getApiKey(settingsConfig.provider);

      // Fallback: if no key in secrets, try reading directly from Claude Code config
      if (!apiKey) {
        apiKey = this.readClaudeConfigKey(settingsConfig.provider);
      }

      this.config_ = { ...settingsConfig, apiKey };

      const models = createProvider(this.config_);
      this.chatModel_ = models.chatModel;
      this.completionModel_ = models.completionModel;

      logInfo(`Provider reloaded: ${settingsConfig.provider} (chat: ${settingsConfig.chatModel})`);

      // Push updated config to the chat panel if it's open
      const panel = ChatPanel.current();
      if (panel) {
        panel.sendConfigState(getConfigState());
      }

      // Validate and warn
      const warnings = validateConfig(settingsConfig, !!apiKey);
      for (const warning of warnings) {
        vscode.window.showWarningMessage(`AI Coding Agent: ${warning}`);
      }
    } catch (err) {
      logError('Failed to reload provider configuration', err);
      vscode.window.showErrorMessage(
        `AI Coding Agent: Failed to load AI provider. ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  getChatModel(): LanguageModelV1 {
    if (!this.chatModel_) {
      throw new Error('ProviderManager not initialized. Call initialize() first.');
    }
    return this.chatModel_;
  }

  getCompletionModel(): LanguageModelV1 {
    if (!this.completionModel_) {
      throw new Error('ProviderManager not initialized. Call initialize() first.');
    }
    return this.completionModel_;
  }

  getConfig(): (ProviderConfig & { apiKey?: string }) | null {
    return this.config_;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private readClaudeConfigKey(_provider: string): string | undefined {
    try {
      const claudePath = path.join(os.homedir(), '.claude', 'settings.json');
      if (!fs.existsSync(claudePath)) return undefined;

      const content = fs.readFileSync(claudePath, 'utf-8');
      const data = JSON.parse(content);
      const env = data.env || {};

      const key = env.ANTHROPIC_AUTH_TOKEN
        || env.ANTHROPIC_API_KEY
        || env.OPENAI_API_KEY;

      if (key) {
        const vscConfig = vscode.workspace.getConfiguration('aiCodingAgent');
        // Auto-apply baseURL and model if not already set
        const hasBaseURL = !!vscConfig.inspect('baseURL')?.globalValue;
        const hasModel = !!vscConfig.inspect('chatModel')?.globalValue;
        if (!hasBaseURL && env.ANTHROPIC_BASE_URL) {
          vscConfig.update('baseURL', env.ANTHROPIC_BASE_URL, vscode.ConfigurationTarget.Global);
        }
        if (!hasModel && env.ANTHROPIC_MODEL) {
          vscConfig.update('chatModel', env.ANTHROPIC_MODEL, vscode.ConfigurationTarget.Global);
        }
        // Auto-set provider if not configured
        if (!vscConfig.inspect('provider')?.globalValue) {
          vscConfig.update('provider', 'anthropic', vscode.ConfigurationTarget.Global);
        }
      }

      return key || undefined;
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
    this.disposables = [];
  }
}
