import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { logInfo, logError } from '../utils/logger';
import type { ProviderId } from '../types/ai';
import { parseClaudeConfig as parseClaudeConfigCore, resolveImportBaseURL } from '@bytepilot/core/config/importer';

/**
 * Configuration importer: one-click import from other AI coding tools.
 * Supports Claude Code, Cursor, and generic JSON/YAML configs.
 */

interface ImportedConfig {
  provider: ProviderId;
  apiKey?: string;
  chatModel?: string;
  baseURL?: string;
  source: string;
  sourcePath: string;
  /** Arbitrary shell command from the source config that can resolve an API key.
   * Never executed without explicit user consent (see runApiKeyHelperWithConsent). */
  apiKeyHelper?: string;
}

/** Cache of scanned configs with full details (including API keys) */
const scanCache = new Map<string, ImportedConfig>();

/** Infer a human-friendly display name for a provider/URL combination */
export function getDisplayProvider(provider: string, baseURL?: string, chatModel?: string): string {
  const url = (baseURL || '').toLowerCase();
  const model = (chatModel || '').toLowerCase();

  if (url.includes('deepseek')) return 'DeepSeek';
  if (url.includes('openrouter')) return 'OpenRouter';
  if (url.includes('groq')) return 'Groq';
  if (url.includes('together')) return 'Together';
  if (url.includes('minimax') || model.includes('minimax')) return 'MiniMax';
  if (url.includes('qwen') || model.includes('qwen')) return 'Qwen';
  if (url.includes('ollama') || url.includes('localhost:11434')) return 'Ollama';
  if (url.includes('deepseek')) return 'DeepSeek';
  if (url.includes('googleapis') || url.includes('generativelanguage')) return 'Gemini';
  if (url.includes('azure') || url.includes('openai.azure')) return 'Azure OpenAI';
  if (url.includes('openai') || provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';

  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Known config file locations to scan automatically */
const KNOWN_LOCATIONS: { name: string; paths: string[]; parser: ParserFn }[] = [
  {
    name: 'Claude Code',
    paths: [
      path.join(os.homedir(), '.claude', 'settings.json'),
      path.join(os.homedir(), '.claude.json'),
    ],
    parser: parseClaudeConfig,
  },
  {
    name: 'Cursor',
    paths: [
      path.join(os.homedir(), '.cursor', 'settings.json'),
      path.join(os.homedir(), '.cursor.json'),
      '.cursor/settings.json',
    ],
    parser: parseCursorConfig,
  },
  {
    name: 'GitHub Copilot (VS Code)',
    paths: [
      path.join(os.homedir(), '.vscode', 'extensions', 'github.copilot-chat-*'),
    ],
    parser: parseGenericJSON,
  },
];

type ParserFn = (content: string, filePath: string) => ImportedConfig | null;

// ============================================================
// Parsers for known formats
// ============================================================

function parseClaudeConfig(content: string, filePath: string): ImportedConfig | null {
  const parsed = parseClaudeConfigCore(content);
  if (!parsed) return null;

  // Also check for apiKeyHelper in legacy format (VS Code-specific concept)
  let apiKeyHelper: string | undefined;
  try {
    const data = JSON.parse(content);
    if (!data.env && typeof data.apiKeyHelper === 'string' && data.apiKeyHelper.trim()) {
      apiKeyHelper = data.apiKeyHelper.trim();
    }
  } catch { /* ignore */ }

  return {
    provider: parsed.provider as ProviderId,
    apiKey: parsed.apiKey,
    chatModel: parsed.chatModel,
    baseURL: parsed.baseURL,
    source: parsed.source,
    sourcePath: filePath,
    apiKeyHelper,
  };
}

function parseCursorConfig(content: string, filePath: string): ImportedConfig | null {
  try {
    const data = JSON.parse(content);

    // Cursor settings may contain model/provider info
    const provider = inferProvider(data.model as string, data.apiUrl as string);
    const apiKey = data.apiKey || data.openaiApiKey || data.anthropicApiKey || undefined;

    return {
      provider,
      apiKey,
      chatModel: (data.model || data.chatModel) as string | undefined,
      baseURL: (data.apiUrl || data.baseURL) as string | undefined,
      source: 'Cursor',
      sourcePath: filePath,
    };
  } catch {
    return null;
  }
}

function parseGenericJSON(content: string, filePath: string): ImportedConfig | null {
  try {
    const data = JSON.parse(content);

    // Try to extract common patterns
    const provider = inferProvider(
      (data.model || data.defaultModel) as string,
      (data.baseURL || data.apiUrl) as string
    );

    const apiKey = data.apiKey || data.key || data.token || undefined;
    const chatModel = (data.model || data.chatModel || data.defaultModel) as string | undefined;

    return {
      provider,
      apiKey,
      chatModel,
      baseURL: (data.baseURL || data.apiUrl) as string | undefined,
      source: path.basename(filePath),
      sourcePath: filePath,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Core logic
// ============================================================

/**
 * Scan known locations for importable configuration files.
 * Returns found configs with parsed data.
 */
export async function scanKnownLocations(): Promise<ImportedConfig[]> {
  scanCache.clear();
  const results: ImportedConfig[] = [];

  for (const source of KNOWN_LOCATIONS) {
    for (const location of source.paths) {
      // Handle glob patterns
      if (location.includes('*')) {
        try {
          const dir = path.dirname(location);
          const pattern = path.basename(location);
          if (fs.existsSync(dir)) {
            const entries = fs.readdirSync(dir);
            const matches = entries.filter((e) => {
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              return regex.test(e);
            });
            for (const match of matches) {
              const fullPath = path.join(dir, match, 'settings.json');
              if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const parsed = source.parser(content, fullPath);
                if (parsed) { results.push(parsed); scanCache.set(parsed.sourcePath, parsed); }
              } else if (fs.existsSync(path.join(dir, match))) {
                const fullPath2 = path.join(dir, match);
                if (fs.statSync(fullPath2).isFile()) {
                  const content = fs.readFileSync(fullPath2, 'utf-8');
                  const parsed = source.parser(content, fullPath2);
                  if (parsed) { results.push(parsed); scanCache.set(parsed.sourcePath, parsed); }
                }
              }
            }
          }
        } catch {
          // Skip locations that can't be read
        }
        continue;
      }

      // Regular file path
      if (fs.existsSync(location)) {
        try {
          const stat = fs.statSync(location);
          if (stat.isFile()) {
            const content = fs.readFileSync(location, 'utf-8');
            const parsed = source.parser(content, location);
            // Only include if actual AI config was extracted
            if (parsed && (parsed.apiKey || parsed.chatModel || parsed.baseURL)) {
              results.push(parsed);
              scanCache.set(parsed.sourcePath, parsed);
              break;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  return results;
}

/**
 * Import configuration from a specific file path.
 */
export async function importFromFile(filePath: string): Promise<ImportedConfig | null> {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    // Try all parsers, use the first that succeeds
    for (const source of KNOWN_LOCATIONS) {
      const result = source.parser(content, filePath);
      if (result) return result;
    }
    // Fallback to generic parser
    return parseGenericJSON(content, filePath);
  }

  if (ext === '.yaml' || ext === '.yml') {
    // Basic YAML support (simple key=value only, no full YAML parser dependency)
    return parseSimpleEnvOrYaml(content, filePath);
  }

  // Try .env format
  return parseSimpleEnvOrYaml(content, filePath);
}

/**
 * Open a file picker dialog for manual config import.
 */
export async function pickAndImport(): Promise<ImportedConfig | null> {
  const uris = await vscode.window.showOpenDialog({
    title: 'Import AI Config',
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'Config Files': ['json', 'yaml', 'yml', 'env', 'toml'],
      'All Files': ['*'],
    },
  });

  if (!uris || uris.length === 0) return null;
  return importFromFile(uris[0].fsPath);
}

/**
 * Import config by source path. Tries cache first, then re-parses the file.
 */
export async function importCachedConfig(
  sourcePath: string,
  secretsStore: { setApiKey: (provider: ProviderId, key: string) => Promise<void> }
): Promise<ImportedConfig | null> {
  // Always re-parse the file directly — never trust cache for import
  let config: ImportedConfig | null = null;

  if (fs.existsSync(sourcePath)) {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    // Try known parsers
    for (const source of KNOWN_LOCATIONS) {
      const parsed = source.parser(content, sourcePath);
      if (parsed && parsed.apiKey) {
        config = parsed;
        break;
      }
    }
    // If no key found with known parsers, try generic
    if (!config || !config.apiKey) {
      const generic = parseGenericJSON(content, sourcePath);
      if (generic?.apiKey) config = generic;
    }
    if (!config) {
      config = parseClaudeConfig(content, sourcePath); // Force Claude parser
    }
  }

  if (!config?.apiKey) {
    vscode.window.showErrorMessage(`Could not extract API key from: ${sourcePath}`);
    logError(`No API key found in config file: ${sourcePath}`);
    return null;
  }

  logInfo(`Importing: provider=${config.provider}, model=${config.chatModel}, hasKey=YES`);
  await applyImportedConfig(config, secretsStore);
  return config;
}

/**
 * Apply imported config to VS Code settings.
 */
/**
 * Execute an apiKeyHelper command, but ONLY after explicit user consent.
 * apiKeyHelper is arbitrary shell read from a config file on disk, so running it
 * without confirmation is a code-execution risk. Returns the resolved key or
 * undefined if the user declines or execution fails.
 */
async function runApiKeyHelperWithConsent(command: string, source: string): Promise<string | undefined> {
  const choice = await vscode.window.showWarningMessage(
    `The "${source}" config asks to run a shell command to obtain the API key:\n\n${command}\n\nOnly allow this if you trust the source. Run it?`,
    { modal: true },
    'Run Command',
    'Skip'
  );
  if (choice !== 'Run Command') {
    logInfo('User declined to run apiKeyHelper command');
    return undefined;
  }
  try {
    const result = execSync(command, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && !result.startsWith('Error')) return result;
  } catch (err) {
    logError('apiKeyHelper execution failed', err);
  }
  return undefined;
}

export async function applyImportedConfig(
  imported: ImportedConfig,
  secretsStore: { setApiKey: (provider: ProviderId, key: string) => Promise<void> }
): Promise<void> {
  const config = vscode.workspace.getConfiguration('aiCodingAgent');

  // If no direct key was found but an apiKeyHelper command is present, ask the
  // user for consent before executing it.
  let apiKey = imported.apiKey;
  if (!apiKey && imported.apiKeyHelper) {
    apiKey = await runApiKeyHelperWithConsent(imported.apiKeyHelper, imported.source);
  }

  // Store API key FIRST — config.update() triggers onDidChangeConfiguration
  // which calls ProviderManager.reload() which validates the API key exists
  if (apiKey) {
    await secretsStore.setApiKey(imported.provider, apiKey);
  }

  await config.update('provider', imported.provider, vscode.ConfigurationTarget.Global);
  if (imported.chatModel) {
    await config.update('chatModel', imported.chatModel, vscode.ConfigurationTarget.Global);
  }
  if (imported.baseURL) {
    const normalizedURL = resolveImportBaseURL(imported.provider, imported.baseURL);
    await config.update('baseURL', normalizedURL, vscode.ConfigurationTarget.Global);
  }

  logInfo(`Config imported from ${imported.source}: ${imported.sourcePath}`);
}

/**
 * Interactive import flow: scan, let user choose, and apply.
 */
export async function interactiveImport(
  secretsStore: { setApiKey: (provider: ProviderId, key: string) => Promise<void> }
): Promise<void> {
  // Step 1: Scan for known configs
  const found = await scanKnownLocations();

  // Step 2: Build pick list
  const items: vscode.QuickPickItem[] = [];

  if (found.length > 0) {
    items.push({ label: '$(folder-opened) Found Configurations', kind: vscode.QuickPickItemKind.Separator });
    for (const cfg of found) {
      const modelInfo = cfg.chatModel ? ` (${cfg.chatModel})` : '';
      const keyInfo = cfg.apiKey ? ' [has key]' : ' [no key]';
      items.push({
        label: `$(pass) ${cfg.source}`,
        description: `${cfg.provider}${modelInfo}${keyInfo}`,
        detail: cfg.sourcePath,
      });
    }
  }

  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({
    label: '$(folder-opened) Browse for config file...',
    description: 'Select a .json/.yaml/.env file manually',
    detail: 'Supports Claude Code, Cursor, generic JSON formats',
  });

  // Step 3: Let user pick
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: found.length > 0
      ? `Found ${found.length} config(s). Select to import...`
      : 'No known configs found. Browse manually or select...',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!pick) return;

  // Step 4: Import
  let imported: ImportedConfig | null = null;

  if (pick.label.includes('Browse')) {
    imported = await pickAndImport();
  } else {
    // Find the matching config
    const idx = items.indexOf(pick);
    // Account for separators offset
    if (idx > 0 && idx - 1 < found.length) {
      imported = found[idx - 1];
    }
  }

  if (!imported) {
    vscode.window.showWarningMessage('No configuration could be imported.');
    return;
  }

  // Step 5: Preview and confirm
  const details = [
    `Source: ${imported.source}`,
    `Provider: ${imported.provider}`,
    imported.chatModel ? `Model: ${imported.chatModel}` : '',
    imported.baseURL ? `Base URL: ${imported.baseURL}` : '',
    imported.apiKey ? 'API Key: [found]' : 'API Key: [not found - will need manual entry]',
  ].filter(Boolean).join('\n');

  const confirm = await vscode.window.showInformationMessage(
    `Import this configuration?\n\n${details}`,
    { modal: true },
    'Import',
    'Cancel'
  );

  if (confirm !== 'Import') return;

  // Step 6: Apply
  await applyImportedConfig(imported, secretsStore);
  vscode.window.showInformationMessage(
    `Configuration imported from ${imported.source}. You can now use "Test AI Provider" to verify.`
  );
}

// ============================================================
// Helpers
// ============================================================

function inferProvider(model?: string, url?: string): ProviderId {
  if (url) {
    const lower = url.toLowerCase();
    if (lower.includes('openai') || lower.includes('api.openai.com')) return 'openai';
    if (lower.includes('anthropic') || lower.includes('api.anthropic.com')) return 'anthropic';
    if (lower.includes('deepseek')) return 'deepseek';
    if (lower.includes('localhost:11434') || lower.includes('ollama')) return 'ollama';
  }
  if (model) {
    const lower = model.toLowerCase();
    if (lower.includes('claude')) return 'anthropic';
    if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return 'openai';
    if (lower.includes('deepseek')) return 'deepseek';
  }
  return 'anthropic'; // Default
}

function parseSimpleEnvOrYaml(content: string, filePath: string): ImportedConfig | null {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // key=value or key: value format
    const eqMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*[=:]\s*(.+)$/);
    if (eqMatch) {
      result[eqMatch[1].toLowerCase()] = eqMatch[2].replace(/^["']|["']$/g, '').trim();
    }
  }

  if (Object.keys(result).length === 0) return null;

  const provider = inferProvider(
    result.model || result.chat_model,
    result.base_url || result.api_url
  );

  return {
    provider,
    apiKey: result.api_key || result.apikey || result.key || result.token,
    chatModel: result.model || result.chat_model,
    baseURL: result.base_url || result.api_url,
    source: path.basename(filePath),
    sourcePath: filePath,
  };
}
