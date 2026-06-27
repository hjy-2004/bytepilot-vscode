import * as vscode from 'vscode';
import type { ProviderId } from '../types/ai';
import { logError } from '../utils/logger';

const SECRET_PREFIX = 'aiCodingAgent.apiKey.';

/**
 * Wraps VS Code's SecretStorage for secure API key management.
 * API keys are stored in the OS keychain, never in settings.json.
 */
export class SecretsStore implements vscode.Disposable {
  private onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(provider: ProviderId): Promise<string | undefined> {
    try {
      const key = await this.secrets.get(`${SECRET_PREFIX}${provider}`);
      return key || undefined;
    } catch (err) {
      logError(`Failed to read API key for ${provider}`, err);
      return undefined;
    }
  }

  async setApiKey(provider: ProviderId, key: string): Promise<void> {
    try {
      await this.secrets.store(`${SECRET_PREFIX}${provider}`, key);
      this.onDidChangeEmitter.fire();
    } catch (err) {
      logError(`Failed to store API key for ${provider}`, err);
      throw new Error(`Failed to store API key: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }

  async deleteApiKey(provider: ProviderId): Promise<void> {
    try {
      await this.secrets.delete(`${SECRET_PREFIX}${provider}`);
      this.onDidChangeEmitter.fire();
    } catch (err) {
      logError(`Failed to delete API key for ${provider}`, err);
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
