/** Supported provider identifiers */
export type ProviderId = 'openai' | 'anthropic' | 'ollama';

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

/** Default models for each provider */
export const PROVIDER_DEFAULTS: Record<ProviderId, { chatModel: string; completionModel: string }> = {
  openai: { chatModel: 'gpt-4o', completionModel: 'gpt-4o-mini' },
  anthropic: { chatModel: 'claude-sonnet-4-6', completionModel: 'claude-haiku-4-5-20251001' },
  ollama: { chatModel: 'codellama', completionModel: 'codellama' },
};

/** Known models per provider (for UI display; actual models fetched from APIs in future) */
export const KNOWN_MODELS: Record<ProviderId, ModelInfo[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'o3-mini', name: 'o3 Mini' },
  ],
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    // Third-party Anthropic-compatible models (via custom baseURL)
    { id: 'deepseek-v4-pro[1m]', name: 'DeepSeek V4 Pro (1M)' },
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
};
