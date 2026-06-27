import type { LanguageModelV1 } from 'ai';
import type { ProviderConfig } from '../types/ai';

/**
 * Selects the appropriate model for a given task type.
 * Allows using different models for chat vs completion.
 */
export class ModelSelector {
  private chatModel: LanguageModelV1 | null = null;
  private completionModel: LanguageModelV1 | null = null;
  private config: ProviderConfig | null = null;

  constructor(private readonly createProviderFn: (config: ProviderConfig & { apiKey?: string }) => {
    chatModel: LanguageModelV1;
    completionModel: LanguageModelV1;
  }) {}

  update(config: ProviderConfig & { apiKey?: string }): void {
    this.config = config;
    const models = this.createProviderFn(config);
    this.chatModel = models.chatModel;
    this.completionModel = models.completionModel;
  }

  getChatModel(): LanguageModelV1 {
    if (!this.chatModel) {
      throw new Error('ModelSelector not initialized. Call update() first.');
    }
    return this.chatModel;
  }

  getCompletionModel(): LanguageModelV1 {
    // Fall back to chat model if no separate completion model
    return this.completionModel || this.chatModel!;
  }

  getConfig(): ProviderConfig | null {
    return this.config;
  }
}
