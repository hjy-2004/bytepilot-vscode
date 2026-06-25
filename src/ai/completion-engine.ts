import * as vscode from 'vscode';
import type { LanguageModelV1 } from 'ai';
import { logInfo } from '../utils/logger';

/**
 * Completion engine supporting multiple providers for code completions.
 * DeepSeek and Ollama use native FIM endpoints.
 * OpenAI and Anthropic fall back to a chat-completion based approach.
 */
export class CompletionEngine {
  constructor(private model: LanguageModelV1) {}

  updateModel(model: LanguageModelV1): void {
    this.model = model;
  }

  async generate(
    prefix: string,
    suffix: string,
    provider: string,
    apiKey: string,
    baseURL?: string,
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    const modelId = this.model.modelId.replace(/\[.*\]$/, '').trim();
    const cfg = vscode.workspace.getConfiguration('aiCodingAgent');
    const temperature = cfg.get<number>('completionTemperature') ?? 0.0;
    const maxTokens = cfg.get<number>('completionMaxTokens') ?? 256;

    switch (provider) {
      case 'ollama':
        return this.generateOllamaFIM(modelId, prefix, suffix, temperature, maxTokens, apiKey, baseURL, abortSignal);
      case 'openai':
        return this.generateOpenAIFIM(modelId, prefix, suffix, temperature, maxTokens, apiKey, baseURL, abortSignal);
      default:
        // DeepSeek / Anthropic-compatible FIM
        return this.generateDeepSeekFIM(modelId, prefix, suffix, temperature, maxTokens, apiKey, baseURL, abortSignal);
    }
  }

  /** DeepSeek native FIM: POST /beta/completions */
  private async generateDeepSeekFIM(
    modelId: string,
    prefix: string,
    suffix: string,
    temperature: number,
    maxTokens: number,
    apiKey: string,
    baseURL?: string,
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const url = (baseURL || 'https://api.deepseek.com')
        .replace(/\/anthropic\/?$/, '/beta')
        .replace(/\/v1\/?$/, '/beta')
        + '/completions';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          prompt: prefix,
          suffix,
          max_tokens: maxTokens,
          temperature,
          stop: ['\n\n\n', '// End of completion'],
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const text = await response.text();
        logInfo(`FIM error (DeepSeek): ${response.status} ${text.substring(0, 200)}`);
        return null;
      }

      const data = await response.json() as { choices?: Array<{ text?: string }> };
      const text = data.choices?.[0]?.text?.trim() || '';
      if (!text) return null;
      logInfo(`FIM response (DeepSeek): ${text.length} chars`);
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      logInfo(`FIM error (DeepSeek): ${err.message}`);
      return null;
    }
  }

  /** Ollama FIM: POST /api/generate with prompt + suffix */
  private async generateOllamaFIM(
    modelId: string,
    prefix: string,
    suffix: string,
    temperature: number,
    maxTokens: number,
    apiKey: string,
    baseURL?: string,
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const url = (baseURL || 'http://localhost:11434').replace(/\/v1\/?$/, '') + '/api/generate';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey && apiKey !== 'ollama') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          prompt: prefix,
          suffix,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
            stop: ['\n\n\n', '// End of completion'],
          },
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const text = await response.text();
        logInfo(`FIM error (Ollama): ${response.status} ${text.substring(0, 200)}`);
        return null;
      }

      const data = await response.json() as { response?: string };
      const text = data.response?.trim() || '';
      if (!text) return null;
      logInfo(`FIM response (Ollama): ${text.length} chars`);
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      logInfo(`FIM error (Ollama): ${err.message}`);
      return null;
    }
  }

  /** OpenAI chat-based fill: POST /chat/completions (no native FIM endpoint) */
  private async generateOpenAIFIM(
    modelId: string,
    prefix: string,
    suffix: string,
    temperature: number,
    maxTokens: number,
    apiKey: string,
    baseURL?: string,
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const url = (baseURL || 'https://api.openai.com/v1') + '/chat/completions';
      // Truncate prefix/suffix to avoid blowing context
      const maxCtx = 2000;
      const prefixTrunc = prefix.length > maxCtx ? prefix.slice(-maxCtx) : prefix;
      const suffixTrunc = suffix.length > maxCtx ? suffix.slice(0, maxCtx) : suffix;

      const userMessage = `<code_before>\n${prefixTrunc}\n</code_before>\n<code_after>\n${suffixTrunc}\n</code_after>\n\nComplete the code between <code_before> and <code_after>. Output ONLY the completion code, no explanation, no backticks.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'You are a code completion engine. Complete code precisely. Output only the missing code segment, no explanations, no markdown fences.' },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature,
          stop: ['\n\n\n'],
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const text = await response.text();
        logInfo(`FIM error (OpenAI): ${response.status} ${text.substring(0, 200)}`);
        return null;
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return null;
      logInfo(`FIM response (OpenAI): ${text.length} chars`);
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      logInfo(`FIM error (OpenAI): ${err.message}`);
      return null;
    }
  }
}
