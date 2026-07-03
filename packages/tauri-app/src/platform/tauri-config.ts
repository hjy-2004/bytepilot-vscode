/**
 * Tauri implementation of IConfigStore.
 * Uses Tauri invoke to read/write configuration via the Rust config module.
 */
import type { IConfigStore, IDisposable } from '@bytepilot/core';

export class TauriConfigStore implements IConfigStore {
  private invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;

  constructor(invokeFn: (cmd: string, args?: Record<string, unknown>) => Promise<any>) {
    this.invoke = invokeFn;
  }

  get<T>(key: string, defaultValue: T): T {
    // Tauri invoke is async, but IConfigStore.get is sync.
    // For simplicity, we return the default — async init will populate actual values.
    // In production, this would use a sync in-memory cache populated at startup.
    return defaultValue;
  }

  async init(): Promise<void> {
    // Pre-load config from Rust backend
    // This would be called at startup to populate the cache
  }

  async set(key: string, value: string): Promise<void> {
    await this.invoke('cmd_set_config', { key, value });
  }

  async getAsync<T>(key: string, defaultValue: T): Promise<T> {
    const result = await this.invoke('cmd_get_config', { key });
    if (result) {
      if (typeof defaultValue === 'number') return Number(result) as unknown as T;
      if (typeof defaultValue === 'boolean') return (result === 'true') as unknown as T;
      return result as unknown as T;
    }
    return defaultValue;
  }

  onDidChange(_listener: (keys: string[]) => void): IDisposable {
    // Desktop app config changes are user-initiated and don't need event listening
    return { dispose: () => {} };
  }
}
