import type { LanguageModelV1 } from 'ai';
import { logInfo } from '../utils/logger';

/**
 * Completion engine supporting DeepSeek's FIM (Fill-in-the-Middle) API.
 * Uses raw fetch to DeepSeek's /beta endpoint for code completions.
 */
export class CompletionEngine {
  constructor(private model: LanguageModelV1) {}

  updateModel(model: LanguageModelV1): void {
    this.model = model;
  }

  async generate(
    prompt: string,
    suffix: string,
    apiKey: string,
    baseURL?: string,
    abortSignal?: AbortSignal
  ): Promise<string | null> {
    try {
      // Read settings for temperature/maxTokens
      const vscode = require('vscode');
      const cfg = vscode.workspace.getConfiguration('aiCodingAgent');
      const temperature = cfg.get<number>('completionTemperature') ?? 0.0;
      const maxTokens = cfg.get<number>('completionMaxTokens') ?? 256;

      // DeepSeek FIM endpoint
      const url = (baseURL || 'https://api.deepseek.com')
        .replace(/\/anthropic\/?$/, '/beta')
        .replace(/\/v1\/?$/, '/beta')
        + '/completions';

      const modelId = this.model.modelId.replace(/\[.*\]$/, '').trim();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          prompt,
          suffix,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const text = await response.text();
        logInfo(`FIM error: ${response.status} ${text.substring(0, 200)}`);
        return null;
      }

      const data = await response.json() as {
        choices?: Array<{ text?: string }>;
      };

      const text = data.choices?.[0]?.text?.trim() || '';
      if (!text) return null;

      logInfo(`FIM response: ${text.length} chars`);
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      logInfo(`FIM error: ${err.message}`);
      return null;
    }
  }
}
