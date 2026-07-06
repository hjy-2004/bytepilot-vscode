/**
 * Tauri implementation of IConfigStore.
 * Uses Tauri invoke to read/write configuration via the Rust config module.
 * Maintains an in-memory cache for sync get() calls.
 */
import type { IConfigStore, IDisposable } from '@bytepilot/core';

const DEFAULT_CONFIG: Record<string, string> = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  completionModel: '',
  baseURL: '',
  temperature: '0.7',
  maxTokens: '4096',
  thinkingBudget: '4096',
  completionsEnabled: 'true',
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
    // Fall back to hardcoded defaults
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
    // Pre-load all known config keys from Rust backend
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
    // Try cache first
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      if (typeof defaultValue === 'number') return Number(cached) as unknown as T;
      if (typeof defaultValue === 'boolean') return (cached === 'true') as unknown as T;
      return cached as unknown as T;
    }
    // Fetch from backend
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

  onDidChange(_listener: (keys: string[]) => void): IDisposable {
    return { dispose: () => {} };
  }
}
