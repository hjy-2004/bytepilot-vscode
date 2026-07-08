/**
 * Config Importer — shared parsing logic for AI coding tool configs.
 * Used by both VS Code extension and Tauri desktop. Platform-independent:
 * accepts file content as a string, returns parsed config or null.
 */

export interface ParsedConfig {
  provider: string;
  chatModel?: string;
  baseURL?: string;
  apiKey?: string;
  source: string;
}

/**
 * Parse a Claude Code settings.json (or .claude.json) file.
 *
 * Supports two formats:
 * 1. Modern env-based: `{ "env": { "ANTHROPIC_AUTH_TOKEN": "...", ... } }`
 * 2. Legacy: `{ "model": "...", "apiKey": "...", "baseURL": "..." }`
 */
export function parseClaudeConfig(content: string): ParsedConfig | null {
  try {
    const data = JSON.parse(content);
    const env = data.env || {};
    const isEnvFormat = Object.keys(env).length > 0;

    let model: string | undefined;
    let apiKey: string | undefined;
    let baseURL: string | undefined;

    if (isEnvFormat) {
      apiKey =
        env.ANTHROPIC_AUTH_TOKEN ||
        env.ANTHROPIC_API_KEY ||
        env.OPENAI_API_KEY ||
        env.API_KEY;
      baseURL =
        env.ANTHROPIC_BASE_URL ||
        env.OPENAI_BASE_URL ||
        env.BASE_URL;
      model =
        env.ANTHROPIC_MODEL ||
        env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
        env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    } else {
      model = data.model || data.defaultModel;
      baseURL = data.baseURL;
      apiKey = data.apiKey || data.anthropicApiKey || data.openaiApiKey;
    }

    // Strip ANSI escape codes that sometimes leak into stored values
    model = stripAnsi(model || '');

    // Infer provider from base URL
    const urlLower = (baseURL || '').toLowerCase();
    let provider = 'anthropic';
    if (urlLower.includes('openai.com') || env.OPENAI_API_KEY) provider = 'openai';
    else if (urlLower.includes('deepseek.com')) provider = 'deepseek';
    else if (urlLower.includes('localhost:11434') || urlLower.includes('ollama'))
      provider = 'ollama';

    if (!model && provider === 'anthropic') model = 'claude-sonnet-4-6';

    return {
      provider,
      chatModel: model || undefined,
      baseURL: baseURL || undefined,
      apiKey: apiKey || undefined,
      source: 'Claude Code',
    };
  } catch {
    return null;
  }
}

/** Strip ANSI escape codes (CSI + OSC sequences) from a string. */
export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // CSI: \x1b[1m, \x1b[0m, etc.
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)?/g, '')  // OSC: \x1b]0;...\x07
    .replace(/\[[0-9;]*[a-zA-Z]/g, '')  // Broken/malformed CSI without ESC prefix
    .replace(/\]$/, '')  // Trailing bracket
    .trim();
}

/** Known config file paths to scan (relative to home directory). */
export const KNOWN_CONFIG_PATHS = [
  '.claude/settings.json',
  '.claude.json',
];
