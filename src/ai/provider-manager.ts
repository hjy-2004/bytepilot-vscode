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
import {
  getProviderPreset,
  detectApiFormat,
  buildProviderEnv,
} from '@bytepilot/core';

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
    // NOTE: onDidChangeConfiguration is handled by extension.ts, which awaits
    // reload() before recreating ChatEngine/CompletionEngine to avoid a race
    // condition where engines get the old model.

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
      let apiKey: string | undefined;

      // Try the effective provider first (inferred from baseURL, e.g. 'kimi', 'zhipu'),
      // then fall back to the raw provider ID (e.g. 'openai-compatible', 'anthropic').
      // This allows per-provider API keys when multiple services share the same protocol.
      const effectiveProvider = inferEffectiveProvider(settingsConfig.baseURL || '', settingsConfig.provider);
      apiKey = await this.secretsStore.getApiKey(effectiveProvider);
      if (!apiKey) {
        apiKey = await this.secretsStore.getApiKey(settingsConfig.provider);
      }

      // Fallback: if no key in secrets, try reading directly from Claude Code config
      if (!apiKey) {
        apiKey = this.readClaudeConfigKey(settingsConfig.provider);
      }

      this.config_ = { ...settingsConfig, apiKey };

      const models = createProvider(this.config_);
      this.chatModel_ = models.chatModel;
      this.completionModel_ = models.completionModel;

      logInfo(`Provider reloaded: ${settingsConfig.provider} (chat: ${settingsConfig.chatModel})`);

      // Sync provider config to ~/.bytepilot/settings.json
      // when the user has explicitly configured a provider.
      this.writeAICodingAgentSettings(settingsConfig, apiKey);

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

      // Return the API key only — do NOT auto-apply settings.
      // Users must explicitly configure their provider via "Configure AI Provider".

      return key || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Write the current provider configuration to ~/.bytepilot/settings.json.
   * This file is read by external AI coding tools for cross-tool provider sharing.
   */
  private writeAICodingAgentSettings(
    settingsConfig: ProviderConfig,
    apiKey?: string,
  ): void {
    // Only write when the user has explicitly configured settings
    // (not using VS Code's package.json defaults)
    const inspection = vscode.workspace.getConfiguration('aiCodingAgent').inspect('provider');
    const isUserConfigured = !!(inspection?.globalValue || inspection?.workspaceValue);
    if (!isUserConfigured || !settingsConfig.provider) return;

    try {
      const dir = path.join(os.homedir(), '.bytepilot');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const preset = getProviderPreset(settingsConfig.provider);
      const apiFormat = detectApiFormat(settingsConfig.provider, settingsConfig.baseURL);
      const baseURL = settingsConfig.baseURL || preset?.baseURL || '';
      const chatModel = settingsConfig.chatModel;
      const completionModel = settingsConfig.completionModel || chatModel;

      // API key is written in plain text so the user can manually edit it.
      const env = buildProviderEnv(apiFormat, baseURL, apiKey || '', chatModel, completionModel);

      const settings = {
        provider: preset?.id || settingsConfig.provider,
        providerName: preset?.name || settingsConfig.provider,
        apiFormat,
        baseURL,
        chatModel,
        completionModel,
        env,
      };

      const filePath = path.join(dir, 'settings.json');
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
      logInfo(`Synced provider config to ${filePath}`);
    } catch (err) {
      // Non-fatal: settings.json sync failure should not break the extension
      logError('Failed to write .bytepilot/settings.json', err);
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
    this.disposables = [];
  }
}

/**
 * Infer the effective provider ID from baseURL, matching the same heuristics
 * used by ModelSelector to display the correct model list and per-provider API keys.
 */
function inferEffectiveProvider(baseURL: string, rawProvider: string): string {
  const url = baseURL.toLowerCase();
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('moonshot.cn')) return 'kimi';
  if (url.includes('bigmodel.cn') || url.includes('api.z.ai')) return 'zhipu';
  if (url.includes('minimaxi.com') || url.includes('minimax.io')) return 'minimax';
  if (url.includes('stepfun.com') || url.includes('stepfun.ai')) return 'stepfun';
  if (url.includes('dashscope.aliyuncs.com')) return 'bailian';
  if (url.includes('qianfan.baidubce.com')) return 'baidu-qianfan';
  if (url.includes('volces.com')) return 'volcano';
  if (url.includes('xiaomimimo.com')) return 'xiaomi-mimo';
  if (url.includes('longcat.chat')) return 'longcat';
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('siliconflow.cn') || url.includes('siliconflow.com')) return 'siliconflow';
  if (url.includes('aihubmix.com')) return 'aihubmix';
  if (url.includes('cherryin.net')) return 'cherryin';
  if (url.includes('shengsuanyun.com')) return 'shengsuanyun';
  return rawProvider;
}
