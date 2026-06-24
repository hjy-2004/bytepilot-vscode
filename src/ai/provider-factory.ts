import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';
import type { ProviderConfig } from '../types/ai';
import { logProviderConfig } from '../utils/ai-logger';

/**
 * Pure factory: given a ProviderConfig, returns Vercel AI SDK LanguageModelV1 instances.
 * This is the ONLY file that imports provider-specific SDK packages.
 *
 * Ollama is handled via the OpenAI-compatible endpoint (no separate package needed).
 */
export function createProvider(config: ProviderConfig & { apiKey?: string }): {
  chatModel: LanguageModelV1;
  completionModel: LanguageModelV1;
} {
  logProviderConfig(config.provider, config.chatModel, config.completionModel, config.baseURL);

  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        compatibility: 'strict',
      });
      return {
        chatModel: openai(config.chatModel),
        completionModel: openai(config.completionModel),
      };
    }
    case 'anthropic': {
      // DeepSeek and similar proxies work more reliably via OpenAI-compatible protocol
      const url = (config.baseURL || '').toLowerCase();
      const isDeepSeek = url.includes('deepseek.com');
      if (isDeepSeek) {
        // Use OpenAI-compatible endpoint for better tool calling support
        // Strip Anthropic-specific suffixes like [1m] — DeepSeek's OpenAI endpoint uses plain model names
        const modelName = config.chatModel.replace(/\[.*\]$/, '').trim();
        const completionName = config.completionModel.replace(/\[.*\]$/, '').trim();
        const deepSeek = createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL?.replace(/\/anthropic\/?$/, '/v1') || 'https://api.deepseek.com/v1',
          compatibility: 'compatible',
        });
        return {
          chatModel: deepSeek(modelName),
          completionModel: deepSeek(completionName || modelName),
        };
      }
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      return {
        chatModel: anthropic(config.chatModel),
        completionModel: anthropic(config.completionModel),
      };
    }
    case 'ollama': {
      // Ollama provides an OpenAI-compatible endpoint at /v1
      const ollama = createOpenAI({
        apiKey: 'ollama', // Ollama ignores this but SDK requires non-empty
        baseURL: config.baseURL || 'http://localhost:11434/v1',
        compatibility: 'compatible',
      });
      return {
        chatModel: ollama(config.chatModel),
        completionModel: ollama(config.completionModel),
      };
    }
    default:
      throw new Error(`Unknown provider: ${(config as any).provider}`);
  }
}
