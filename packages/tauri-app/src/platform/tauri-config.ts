/**
 * Tauri implementation of IConfigStore.
 * Uses Tauri invoke to read/write configuration via the Rust config module.
 * Configuration is stored at ~/.bytepilot/settings.json.
 *
 * Maintains an in-memory cache for sync get() calls.
 */
import type { IConfigStore, IDisposable } from '@bytepilot/core';
import {
  getProviderPreset,
  buildSettingsFromPreset,
  type ProviderPreset,
} from '@bytepilot/core';

const DEFAULT_CONFIG: Record<string, string> = {
  provider: '',
  providerName: '',
  apiFormat: '',
  baseURL: '',
  chatModel: '',
  completionModel: '',
};

export class TauriConfigStore implements IConfigStore {
  private invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;
  private cache: Map<string, string> = new Map();
  private initialized = false;

  constructor(invokeFn: (cmd: string, args?: Record<string, unknown>) => Promise<any>) {
    this.invoke = invokeFn;
  }

  get<T>(key: string, defaultValue: T): T {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      if (typeof defaultValue === 'number') return Number(cached) as unknown as T;
      if (typeof defaultValue === 'boolean') return (cached === 'true') as unknown as T;
      return cached as unknown as T;
    }
    const hardDefault = DEFAULT_CONFIG[key];
    if (hardDefault !== undefined) {
      if (typeof defaultValue === 'number') return Number(hardDefault) as unknown as T;
      if (typeof defaultValue === 'boolean') return (hardDefault === 'true') as unknown as T;
      return hardDefault as unknown as T;
    }
    return defaultValue;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      try {
        const val = await this.invoke('cmd_get_config', { key });
        if (val) this.cache.set(key, String(val));
      } catch {
        // Key not yet set on disk — default will be used
      }
    }
    this.initialized = true;
  }

  async set(key: string, value: string): Promise<void> {
    await this.invoke('cmd_set_config', { key, value });
    this.cache.set(key, value);
  }

  async getAsync<T>(key: string, defaultValue: T): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      if (typeof defaultValue === 'number') return Number(cached) as unknown as T;
      if (typeof defaultValue === 'boolean') return (cached === 'true') as unknown as T;
      return cached as unknown as T;
    }
    try {
      const result = await this.invoke('cmd_get_config', { key });
      if (result) {
        this.cache.set(key, String(result));
        if (typeof defaultValue === 'number') return Number(result) as unknown as T;
        if (typeof defaultValue === 'boolean') return (result === 'true') as unknown as T;
        return result as unknown as T;
      }
    } catch {
      // Fall through to default
    }
    return defaultValue;
  }

  /**
   * Sync a full provider configuration to settings.json.
   * Called when the user switches providers.
   *
   * This writes the complete provider preset (baseURL, models, apiFormat, env vars, etc.)
   * to ~/.bytepilot/settings.json so external tools can read it.
   */
  async syncProvider(
    providerId: string,
    overrides?: { baseURL?: string; chatModel?: string; completionModel?: string; apiKey?: string },
  ): Promise<void> {
    const preset = getProviderPreset(providerId);
    if (!preset) {
      console.warn(`[TauriConfigStore] Unknown provider: ${providerId}`);
      return;
    }

    const settings = buildSettingsFromPreset(preset, overrides, {
      temperature: Number(this.cache.get('temperature') || '0.7'),
      maxTokens: Number(this.cache.get('maxTokens') || '4096'),
      thinkingBudget: Number(this.cache.get('thinkingBudget') || '4096'),
    });

    await this.invoke('cmd_sync_provider', {
      provider: settings.provider,
      providerName: settings.providerName,
      apiFormat: settings.apiFormat,
      baseUrl: settings.baseURL,
      chatModel: settings.chatModel,
      completionModel: settings.completionModel,
      env: settings.env,
    });

    // Update local cache with new provider settings
    this.cache.set('provider', settings.provider);
    this.cache.set('providerName', settings.providerName);
    this.cache.set('apiFormat', settings.apiFormat);
    this.cache.set('baseURL', settings.baseURL);
    this.cache.set('chatModel', settings.chatModel);
    this.cache.set('completionModel', settings.completionModel);
  }

  onDidChange(_listener: (keys: string[]) => void): IDisposable {
    return { dispose: () => {} };
  }
}
