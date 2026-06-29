/** Supported provider identifiers */
export type ProviderId =
  | 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'google' | 'azure-openai'
  | 'openai-compatible'; // catch-all for aggregators / OpenAI-compatible endpoints

/** Resolved configuration for a single provider */
export interface ProviderConfig {
  provider: ProviderId;
  apiKey?: string;
  baseURL?: string;
  chatModel: string;
  completionModel: string;
  options: {
    temperature: number;
    maxTokens: number;
  };
}

/** Model info exposed to the UI */
export interface ModelInfo {
  id: string;
  name: string;
}

/**
 * Re-export provider knowledge base types for convenience.
 * The full catalog is in src/types/providers.ts.
 */
export type { ProviderCategory, ApiFormat, ProviderPreset, ModelVariant } from './providers';

/** Default models for each base provider */
export const PROVIDER_DEFAULTS: Record<string, { chatModel: string; completionModel: string }> = {
  openai: { chatModel: 'gpt-4o', completionModel: 'gpt-4o-mini' },
  anthropic: { chatModel: 'claude-sonnet-4-6', completionModel: 'claude-haiku-4-5-20251001' },
  ollama: { chatModel: 'codellama', completionModel: 'codellama' },
  deepseek: { chatModel: 'deepseek-v4-pro', completionModel: 'deepseek-v4-flash' },
  google: { chatModel: 'gemini-2.5-pro', completionModel: 'gemini-2.5-flash' },
  'azure-openai': { chatModel: 'gpt-4o', completionModel: 'gpt-4o-mini' },
  'openai-compatible': { chatModel: 'gpt-4o', completionModel: 'gpt-4o-mini' },
};

/**
 * Known models per base provider (for UI display).
 * Extended catalog from cc-switch. For full per-provider models see PROVIDER_PRESETS.
 */
export const KNOWN_MODELS: Record<string, ModelInfo[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'o3-mini', name: 'o3 Mini' },
  ],
  anthropic: [
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    // Third-party Anthropic-compatible models (via custom baseURL)
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v3', name: 'DeepSeek V3' },
    { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
    { id: 'qwen3.7-max', name: 'Qwen 3.7 Max' },
  ],
  ollama: [
    { id: 'codellama', name: 'CodeLlama' },
    { id: 'llama3', name: 'Llama 3' },
    { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
  ],
  deepseek: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  ],
  'azure-openai': [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  'openai-compatible': [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'glm-5.1', name: 'GLM 5.1' },
  ],
};
