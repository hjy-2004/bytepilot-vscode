import * as vscode from 'vscode';
import type { ProviderId, ProviderConfig, ModelInfo } from '../types/ai';
import { PROVIDER_DEFAULTS, KNOWN_MODELS } from '../types/ai';
import { getDisplayProvider } from './importer';

const CONFIG_SECTION = 'aiCodingAgent';

/**
 * Reads the VS Code settings and produces a typed ProviderConfig (without API key).
 */
export function readConfig(): ProviderConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const provider = (config.get<string>('provider') || 'anthropic') as ProviderId;
  const defaults = PROVIDER_DEFAULTS[provider];

  const chatModel = config.get<string>('chatModel') || defaults.chatModel;
  const completionModel = config.get<string>('completionModel') || chatModel;
  const baseURL = config.get<string>('baseURL') || undefined;
  const temperature = config.get<number>('temperature') ?? 0.7;
  const maxTokens = config.get<number>('maxTokens') ?? 4096;

  return {
    provider,
    chatModel,
    completionModel,
    baseURL,
    options: { temperature, maxTokens },
  };
}

/**
 * Returns the list of known models for the active provider.
 */
export function getAvailableModels(provider: ProviderId): ModelInfo[] {
  return KNOWN_MODELS[provider] || [];
}

/**
 * Returns the full configuration state for the WebView.
 */
export function getConfigState(): {
  provider: string;
  chatModel: string;
  completionModel: string;
  temperature: number;
  maxTokens: number;
  completionsEnabled: boolean;
  availableModels: ModelInfo[];
  initialized: boolean;
} {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const provider = (config.get<string>('provider') || 'anthropic') as ProviderId;

  // Check if user has actually configured anything beyond defaults
  const inspection = config.inspect('provider');
  const initialized = !!(inspection?.globalValue || inspection?.workspaceValue);

  const baseURL = config.get<string>('baseURL') || undefined;
  const chatModel = config.get<string>('chatModel') || PROVIDER_DEFAULTS[provider].chatModel;
  const displayProvider = getDisplayProvider(provider, baseURL, chatModel);

  return {
    provider,
    chatModel,
    // Default completion model to chat model if not explicitly set
    completionModel: config.get<string>('completionModel') || chatModel,
    temperature: config.get<number>('temperature') ?? 0.7,
    maxTokens: config.get<number>('maxTokens') ?? 4096,
    completionsEnabled: config.get<boolean>('completionsEnabled') ?? true,
    availableModels: getAvailableModels(provider),
    initialized,
    displayProvider,
  };
}
