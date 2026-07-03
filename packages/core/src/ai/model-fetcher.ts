/**
 * Model list fetching service — calls GET /v1/models (OpenAI-compatible) or
 * equivalent endpoints to discover available models from a provider.
 *
 * Logic adapted from cc-switch/src-tauri/src/services/model_fetch.rs
 */
import { getModelListCandidates } from '../config/provider-presets';
import { logInfo } from '../platform/logger';

export interface ModelFetchResult {
  models: { id: string; name: string }[];
  url: string; // the URL that succeeded
}

/**
 * Fetch the model list from a provider's API.
 *
 * Tries multiple candidate URLs (from getModelListCandidates) until one
 * succeeds. Supports OpenAI-compatible and Gemini-native response formats.
 */
export async function fetchModelList(
  baseURL: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelFetchResult | null> {
  const candidates = getModelListCandidates(baseURL);

  // Also try the Gemini-native models.list endpoint if the URL looks like Google
  if (baseURL.includes('generativelanguage.googleapis.com')) {
    candidates.push(`${baseURL}/v1beta/models?key=${apiKey}`);
  }

  for (const url of candidates) {
    try {
      const result = await tryFetchModels(url, apiKey, signal);
      if (result && result.models.length > 0) {
        logInfo(`[ModelFetcher] Found ${result.models.length} models at ${url}`);
        return result;
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function tryFetchModels(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelFetchResult | null> {
  // Gemini native endpoint uses a different format (no Bearer auth)
  const isGemini = url.includes('generativelanguage.googleapis.com');

  const headers: Record<string, string> = {};
  if (!isGemini) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal,
  });

  if (!res.ok) return null;

  const data = await res.json() as any;

  // Gemini format: { models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", ... }] }
  if (data.models && Array.isArray(data.models)) {
    const models = data.models.map((m: any) => ({
      id: m.name?.replace(/^models\//, '') || m.name || m.id,
      name: m.displayName || m.name?.replace(/^models\//, '') || m.id || '',
    }));
    return { models, url };
  }

  // OpenAI-compatible format: { data: [{ id: "gpt-4o", ... }] }
  if (data.data && Array.isArray(data.data)) {
    const models = data.data.map((m: any) => ({
      id: m.id,
      name: m.id, // OpenAI format typically doesn't have a separate display name
    }));
    return { models, url };
  }

  return null;
}

/**
 * Convenience: fetch models using the current provider config.
 */
export async function fetchModelsForCurrentProvider(
  baseURL: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelFetchResult | null> {
  if (!baseURL || !apiKey) {
    logInfo('[ModelFetcher] Skipping fetch: no baseURL or apiKey');
    return null;
  }
  return fetchModelList(baseURL, apiKey, signal);
}
