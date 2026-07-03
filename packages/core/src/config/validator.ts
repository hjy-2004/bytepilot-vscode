import type { ProviderConfig } from '../types/ai';

/**
 * Validates the provider configuration and returns a list of warnings.
 * Does NOT throw - returns warnings that should be shown to the user.
 */
export function validateConfig(config: ProviderConfig, hasApiKey: boolean): string[] {
  const warnings: string[] = [];

  if (config.provider !== 'ollama' && !hasApiKey) {
    warnings.push(
      `No API key configured for ${config.provider}. Set it via the "AI Coding Agent: Configure Provider" command or aiCodingAgent.baseURL setting.`
    );
  }

  if (!config.chatModel) {
    warnings.push('No chat model configured. Using provider default.');
  }

  if (!config.completionModel) {
    warnings.push('No completion model configured. Will fall back to chat model.');
  }

  if (config.options.temperature < 0 || config.options.temperature > 2) {
    warnings.push('Temperature must be between 0 and 2.');
  }

  if (config.options.maxTokens < 256) {
    warnings.push('Max tokens should be at least 256.');
  }

  return warnings;
}
