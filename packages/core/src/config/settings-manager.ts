/**
 * Settings Manager — builds and resolves the settings.json configuration
 * stored at ~/.bytepilot/settings.json.
 *
 * This module is the bridge between BytePilot's provider presets and the
 * settings.json file that external AI coding tools (Claude Code, etc.) read.
 */
import type { ProviderPreset } from '../types/providers';
import type { ProviderConfig } from '../types/ai';
import { getProviderPreset, resolveProviderConfig, detectApiFormat, buildProviderEnv } from './provider-presets';

/** The structured settings object written to settings.json */
export interface AppSettings {
  provider: string;
  providerName: string;
  apiFormat: string;
  baseURL: string;
  chatModel: string;
  completionModel: string;
  env: Record<string, string>;
}

/** User-configurable overrides for a provider */
export interface ProviderOverrides {
  baseURL?: string;
  chatModel?: string;
  completionModel?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingBudget?: number;
  apiKey?: string;
}

/**
 * Build the full AppSettings object from a provider preset and user overrides.
 * This is what gets written to ~/.bytepilot/settings.json.
 */
export function buildSettingsFromPreset(
  preset: ProviderPreset,
  overrides?: ProviderOverrides,
  _existingSettings?: Partial<AppSettings>,
): AppSettings {
  const resolved = resolveProviderConfig(preset.id, {
    baseURL: overrides?.baseURL,
    chatModel: overrides?.chatModel,
    completionModel: overrides?.completionModel,
  });

  const baseURL = overrides?.baseURL || resolved.baseURL;
  const chatModel = overrides?.chatModel || resolved.chatModel;
  const completionModel = overrides?.completionModel || resolved.completionModel;
  const apiFormat = detectApiFormat(preset.id, baseURL);

  const env = buildProviderEnv(apiFormat, baseURL, overrides?.apiKey || '', chatModel, completionModel);

  return {
    provider: preset.id,
    providerName: preset.name,
    apiFormat,
    baseURL,
    chatModel,
    completionModel,
    env,
  };
}

/**
 * Build the `env` block for external CLI tool compatibility.
 * Delegates to buildProviderEnv with correct apiFormat detection.
 */
export function generateEnvBlock(
  providerId: string,
  baseURL: string,
  apiKey: string,
  chatModel: string,
  completionModel: string,
): Record<string, string> {
  const preset = getProviderPreset(providerId);
  const apiFormat = detectApiFormat(providerId, baseURL);
  return buildProviderEnv(apiFormat, baseURL, apiKey, chatModel, completionModel);
}

/**
 * Resolve a ProviderConfig from an AppSettings object (read from settings.json).
 * Used at startup to initialize the provider factory from stored settings.
 */
export function resolveSettingsProvider(settings: AppSettings): ProviderConfig {
  return {
    provider: mapProviderId(settings.provider, settings.apiFormat),
    apiKey: undefined, // API keys are in env block / OS keychain, not plaintext
    baseURL: settings.baseURL,
    chatModel: settings.chatModel,
    completionModel: settings.completionModel || settings.chatModel,
    options: {
      temperature: 0.7,
      maxTokens: 4096,
    },
  };
}

/**
 * Map a preset provider id + apiFormat to the ProviderId union type.
 */
function mapProviderId(
  providerId: string,
  apiFormat: string,
): 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'google' | 'azure-openai' | 'openai-compatible' {
  // Direct matches
  const directIds = ['openai', 'anthropic', 'ollama', 'deepseek', 'google', 'azure-openai'];
  if (directIds.includes(providerId)) {
    return providerId as 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'google' | 'azure-openai';
  }

  // Map known providers
  if (providerId === 'gemini-native') return 'google';
  if (providerId === 'github-copilot') return 'openai-compatible';
  if (providerId === 'aws-bedrock') return 'anthropic';

  // For all other presets (aggregators, third-party, cn_official), use openai-compatible
  // which routes through the OpenAI-compatible provider factory
  return 'openai-compatible';
}

/**
 * Create empty default settings. All fields are empty — the file is only
 * populated when the user explicitly selects a provider.
 */
export function createDefaultSettings(): AppSettings {
  return {
    provider: '',
    providerName: '',
    apiFormat: '',
    baseURL: '',
    chatModel: '',
    completionModel: '',
    env: {},
  };
}
