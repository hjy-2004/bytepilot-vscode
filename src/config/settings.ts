import * as vscode from 'vscode';
import type { ProviderId, ProviderConfig, ModelInfo } from '../types/ai';
import { PROVIDER_DEFAULTS, KNOWN_MODELS } from '../types/ai';
import { getDisplayProvider } from './importer';
import { findPresetByURL, getModelsForProvider } from './provider-presets';

const CONFIG_SECTION = 'aiCodingAgent';

/**
 * Reads the VS Code settings and produces a typed ProviderConfig (without API key).
 */
export function readConfig(): ProviderConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const provider = (config.get<string>('provider') || 'anthropic') as ProviderId;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS['anthropic'];

  const chatModel = cleanModelName(config.get<string>('chatModel') || defaults.chatModel);
  const completionModel = cleanModelName(config.get<string>('completionModel') || chatModel);
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

/** Strip suffixes like [1m] from model names (DeepSeek notation for 1M context). */
function cleanModelName(name: string): string {
  return name.replace(/\[.*\]$/, '').trim();
}

/**
 * Returns the list of known models for the active provider.
 * First checks the presets, falls back to base KNOWN_MODELS.
 */
export function getAvailableModels(provider: string): ModelInfo[] {
  // Try preset lookup first
  const presetModels = getModelsForProvider(provider);
  if (presetModels.length > 0) return presetModels;

  // Try base provider lookup
  const baseModels = KNOWN_MODELS[provider];
  if (baseModels && baseModels.length > 0) return baseModels;

  return [];
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
  displayProvider?: string;
  baseURL?: string;
} {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const provider = (config.get<string>('provider') || 'anthropic') as ProviderId;

  // Check if user has actually configured anything beyond defaults
  const inspection = config.inspect('provider');
  const initialized = !!(inspection?.globalValue || inspection?.workspaceValue);

  const baseURL = config.get<string>('baseURL') || undefined;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS['anthropic'];
  const chatModel = cleanModelName(config.get<string>('chatModel') || defaults.chatModel);
  const displayProvider = getDisplayProvider(provider, baseURL, chatModel);

  // Enrich available models with preset models when a matching baseURL is found
  let availableModels = getAvailableModels(provider);
  if (baseURL && availableModels.length === 0) {
    const preset = findPresetByURL(baseURL);
    if (preset) {
      availableModels = preset.models;
    }
  }

  return {
    provider,
    chatModel,
    // Default completion model to chat model if not explicitly set
    completionModel: config.get<string>('completionModel') || chatModel,
    temperature: config.get<number>('temperature') ?? 0.7,
    maxTokens: config.get<number>('maxTokens') ?? 4096,
    completionsEnabled: config.get<boolean>('completionsEnabled') ?? true,
    availableModels,
    initialized,
    displayProvider,
    baseURL,
  };
}
