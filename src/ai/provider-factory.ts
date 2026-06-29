import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';
import type { ProviderConfig } from '../types/ai';
import { detectApiFormat, stripCompatSuffix, findPresetByURL } from '../config/provider-presets';
import { logProviderConfig } from '../utils/ai-logger';

/**
 * Pure factory: given a ProviderConfig, returns Vercel AI SDK LanguageModelV1 instances.
 * This is the ONLY file that imports provider-specific SDK packages.
 *
 * Ollama and OpenAI-compatible providers are handled via the OpenAI-compatible endpoint.
 *
 * API format detection now uses the presets knowledge base from cc-switch.
 */
export function createProvider(config: ProviderConfig & { apiKey?: string }): {
  chatModel: LanguageModelV1;
  completionModel: LanguageModelV1;
} {
  logProviderConfig(config.provider, config.chatModel, config.completionModel, config.baseURL);

  // Try to resolve a preset for this provider to get the apiFormat
  const preset = findPresetByURL(config.baseURL || '') ||
                 (config.provider !== 'openai-compatible' ? undefined : undefined);
  const apiFormat = detectApiFormat(config.provider, config.baseURL);

  switch (apiFormat) {
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      return {
        chatModel: google(config.chatModel),
        completionModel: google(config.completionModel),
      };
    }
    case 'anthropic': {
      // For Anthropic-compatible providers that have a /anthropic suffix,
      // we try the native Anthropic Messages API first.
      // But if the URL is a known DeepSeek proxy, fall through to openai_compat.
      const url = (config.baseURL || '').toLowerCase();
      const isDeepSeek = url.includes('deepseek.com');

      if (isDeepSeek) {
        // DeepSeek's Anthropic compat endpoint works better via OpenAI protocol for tool calling
        const modelName = stripModelSuffix(config.chatModel);
        const completionName = stripModelSuffix(config.completionModel);
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

      // Check if URL has an Anthropic compat suffix that should actually use OpenAI protocol
      // (some providers expose /anthropic but work better with OpenAI protocol)
      const shouldUseOpenAICompat = isAnthropicCompatButOpenAIBetter(url, config.provider);

      if (shouldUseOpenAICompat) {
        return createOpenAICompat(config);
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
    case 'openai_chat': {
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
    case 'openai_compat':
    default: {
      return createOpenAICompat(config);
    }
  }
}

/** OpenAI-compatible provider (DeepSeek, Azure, Ollama, aggregators, etc.) */
function createOpenAICompat(config: ProviderConfig & { apiKey?: string }): {
  chatModel: LanguageModelV1;
  completionModel: LanguageModelV1;
} {
  // Strip [1m] suffix from DeepSeek model names — their OpenAI endpoint uses plain names
  const modelName = stripModelSuffix(config.chatModel);
  const completionName = stripModelSuffix(config.completionModel);

  const isOllama = config.provider === 'ollama';
  const isDeepSeek = (config.baseURL || '').toLowerCase().includes('deepseek.com') || config.provider === 'deepseek';

  const effectiveKey = isOllama ? 'ollama' : config.apiKey;

  let baseURL = config.baseURL;
  if (!baseURL) {
    if (isDeepSeek) baseURL = 'https://api.deepseek.com/v1';
    else if (isOllama) baseURL = 'http://localhost:11434/v1';
  }

  const openaiCompat = createOpenAI({
    apiKey: effectiveKey,
    baseURL,
    compatibility: 'compatible',
  });
  return {
    chatModel: openaiCompat(modelName),
    completionModel: openaiCompat(completionName || modelName),
  };
}

/**
 * Strip model name suffixes like "[1m]" (DeepSeek notation for 1M context).
 */
function stripModelSuffix(model: string): string {
  return model.replace(/\[.*\]$/, '').trim();
}

/**
 * Check if a URL with an Anthropic-compat suffix should actually use
 * the OpenAI protocol internally. Some cc-switch providers expose
 * `/anthropic` paths but the underlying model speaks OpenAI Chat format.
 */
function isAnthropicCompatButOpenAIBetter(url: string, provider: string): boolean {
  // Providers known to use OpenAI Chat format despite Anthropic-URL suffixes
  const openAIFormatProviders = ['opencode-go'];
  if (openAIFormatProviders.includes(provider)) return true;

  // URL-based heuristics
  if (url.includes('opencode.ai')) return true;

  return false;
}
