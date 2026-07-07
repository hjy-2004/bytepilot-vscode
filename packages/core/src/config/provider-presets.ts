/**
 * Helper functions for working with the provider presets knowledge base.
 */
import type { ProviderPreset, ApiFormat, ProviderCategory, ModelInfo } from '../types/providers';
import { PROVIDER_PRESETS, KNOWN_COMPAT_SUFFIXES } from '../types/providers';

// ── Lookup ──────────────────────────────────────────────────────────────────────

/** Look up a preset by its id. */
export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === id);
}

/** Return all presets. */
export function getAllProviders(): ProviderPreset[] {
  return PROVIDER_PRESETS;
}

/** Group presets by category (sorted: official → cn_official → cloud_provider → aggregator → third_party). */
export function getProvidersByCategory(): Record<ProviderCategory, ProviderPreset[]> {
  const order: ProviderCategory[] = ['official', 'cn_official', 'cloud_provider', 'aggregator', 'third_party'];
  const result: Record<string, ProviderPreset[]> = {};
  for (const cat of order) {
    result[cat] = PROVIDER_PRESETS.filter(p => p.category === cat);
  }
  return result as Record<ProviderCategory, ProviderPreset[]>;
}

/** Return the known model list for a preset. Falls back to MODEL_CATALOG lookup. */
export function getModelsForProvider(providerId: string): ModelInfo[] {
  const preset = getProviderPreset(providerId);
  if (preset && preset.models.length > 0) return preset.models;
  // Fallback to the six base provider types -> catalog
  return [];
}

/** Return a human-readable category label. */
export function getCategoryLabel(cat: ProviderCategory): string {
  const labels: Record<ProviderCategory, string> = {
    official: 'Official',
    cn_official: 'Chinese Official',
    cloud_provider: 'Cloud',
    aggregator: 'Aggregator',
    third_party: 'Third-Party',
  };
  return labels[cat] || cat;
}

// ── API format detection ───────────────────────────────────────────────────────

/**
 * Detect the API protocol from a provider + baseURL combination.
 *
 * Heuristics (from cc-switch's provider routing logic):
 * - Google Gemini endpoints → 'google'
 * - URLs ending with /anthropic or known Anthropic-compat paths → 'anthropic'
 * - DeepSeek API → 'openai_compat' (uses OpenAI protocol internally)
 * - Everything else → use the preset's declared apiFormat, defaulting to 'openai_compat'
 */
export function detectApiFormat(
  providerId: string,
  baseURL?: string,
): ApiFormat {
  const preset = getProviderPreset(providerId);
  const url = (baseURL || preset?.baseURL || '').toLowerCase();

  // Google Gemini native endpoints
  if (
    url.includes('generativelanguage.googleapis.com') ||
    providerId === 'google' ||
    providerId === 'gemini-native'
  ) {
    return 'google';
  }

  // Anthropic-compatible endpoints (native Messages API with /anthropic suffix)
  // Providers like Kimi For Coding, DeepSeek Anthropic-compat, Zhipu, etc.
  const anthropicPathPatterns = [
    '/anthropic',
    '/api/anthropic',
    '/apps/anthropic',
    '/api/coding',
    '/api/claudecode',
    '/step_plan',
    '/claudecode',
    '/claude',
  ];
  for (const suffix of anthropicPathPatterns) {
    if (url.endsWith(suffix) || url.includes(suffix + '/')) {
      // DeepSeek Anthropic-compat: we still route via OpenAI protocol for better tool calling
      if (url.includes('deepseek.com')) return 'openai_compat';
      return 'anthropic';
    }
  }

  // OpenAI native
  if (url.includes('api.openai.com') && providerId === 'openai') {
    return 'openai_chat';
  }

  // GitHub Copilot uses OpenAI Chat format
  if (url.includes('api.githubcopilot.com')) {
    return 'openai_chat';
  }

  // Use preset's declared format
  if (preset) return preset.apiFormat;

  // Default: OpenAI-compatible (most aggregators use this)
  return 'openai_compat';
}

/**
 * Strip known compat suffixes from a URL to get the root,
 * which can then be used for model-list discovery (GET /v1/models).
 *
 * From cc-switch's model_fetch.rs: build_models_url_candidates()
 */
export function stripCompatSuffix(url: string): string {
  for (const { suffix } of KNOWN_COMPAT_SUFFIXES) {
    if (url.endsWith(suffix)) return url.slice(0, -suffix.length);
  }
  return url;
}

/**
 * Return candidate URLs for fetching the model list.
 * From cc-switch's model_fetch.rs logic.
 */
export function getModelListCandidates(baseURL: string): string[] {
  const candidates: string[] = [];

  // 1. Direct append
  if (baseURL.endsWith('/')) {
    candidates.push(baseURL + 'v1/models');
  } else if (baseURL.endsWith('/v1')) {
    candidates.push(baseURL + '/models');
  } else {
    candidates.push(baseURL + '/v1/models');
  }

  // 2. Version-segment aware
  const versionMatch = baseURL.match(/\/v\d+$/);
  if (versionMatch) {
    candidates.push(baseURL + '/models');
  }

  // 3. Strip known compat suffixes and try
  const stripped = stripCompatSuffix(baseURL);
  if (stripped !== baseURL) {
    if (stripped.endsWith('/')) {
      candidates.push(stripped + 'v1/models');
    } else if (stripped.endsWith('/v1')) {
      candidates.push(stripped + '/models');
    } else {
      candidates.push(stripped + '/v1/models');
      candidates.push(stripped + '/models');
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}

// ── Config resolution ──────────────────────────────────────────────────────────

/**
 * Given a provider ID and optional baseURL override, return the fully-resolved
 * configuration suitable for passing to the provider factory.
 */
export function resolveProviderConfig(
  providerId: string,
  overrides?: { baseURL?: string; chatModel?: string; completionModel?: string },
): { baseURL: string; chatModel: string; completionModel: string; apiFormat: ApiFormat } {
  const preset = getProviderPreset(providerId);
  const baseURL = overrides?.baseURL || preset?.baseURL || '';
  const chatModel = overrides?.chatModel || preset?.defaultChatModel || '';
  const completionModel = overrides?.completionModel || preset?.defaultCompletionModel || chatModel;
  const apiFormat = detectApiFormat(providerId, baseURL);

  return { baseURL, chatModel, completionModel, apiFormat };
}

// ── Settings.json env block generation ──────────────────────────────────────────

/**
 * Build the `env` block for settings.json based on provider apiFormat.
 *
 * The env block provides environment variables that CLI tools (Claude Code, etc.)
 * can read to configure the AI provider connection.
 *
 * - anthropic → ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, etc.
 * - openai_chat / openai_compat → OPENAI_API_KEY, OPENAI_BASE_URL
 * - google → GOOGLE_API_KEY
 */
export function buildProviderEnv(
  apiFormat: string,
  baseURL: string,
  apiKey: string,
  chatModel: string,
  completionModel: string,
): Record<string, string> {
  const env: Record<string, string> = {
    API_TIMEOUT_MS: '3000000',
  };

  switch (apiFormat) {
    case 'anthropic': {
      if (apiKey) env['ANTHROPIC_AUTH_TOKEN'] = apiKey;
      if (baseURL) env['ANTHROPIC_BASE_URL'] = baseURL;
      if (chatModel) {
        env['ANTHROPIC_MODEL'] = chatModel;
        env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = chatModel;
        env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = chatModel;
      }
      if (completionModel) {
        env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = completionModel;
      }
      break;
    }
    case 'openai_chat':
    case 'openai_compat': {
      if (apiKey) env['OPENAI_API_KEY'] = apiKey;
      if (baseURL) env['OPENAI_BASE_URL'] = baseURL;
      break;
    }
    case 'google': {
      if (apiKey) env['GOOGLE_API_KEY'] = apiKey;
      break;
    }
    default: {
      // For unknown formats, include both OpenAI and Anthropic env vars
      if (apiKey) {
        env['OPENAI_API_KEY'] = apiKey;
        env['ANTHROPIC_AUTH_TOKEN'] = apiKey;
      }
      if (baseURL) {
        env['OPENAI_BASE_URL'] = baseURL;
        env['ANTHROPIC_BASE_URL'] = baseURL;
      }
      break;
    }
  }

  return env;
}

/** Try to find a preset matching the given baseURL and model. */
export function findPresetByURL(baseURL: string): ProviderPreset | undefined {
  if (!baseURL) return undefined;
  const url = baseURL.toLowerCase();
  return PROVIDER_PRESETS.find(p => {
    const presetURL = p.baseURL.toLowerCase();
    if (!presetURL) return false;
    return url.includes(presetURL.replace(/^https?:\/\//, '')) ||
           presetURL.includes(url.replace(/^https?:\/\//, ''));
  });
}
