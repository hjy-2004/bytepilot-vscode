// ── Types ──────────────────────────────────────────────────────────────
export type { ProviderId, ProviderConfig } from './types/ai';
export { PROVIDER_DEFAULTS, KNOWN_MODELS } from './types/ai';
// ModelInfo is defined in both ai.ts (simple) and providers.ts (extended) —
// prefer the providers version which is the canonical one.
export type { ModelInfo } from './types/providers';
export type * from './types/chat';
export type * from './types/context';
export type * from './types/diff';
export type * from './types/ipc';
export type * from './types/providers';
export type * from './types/tools';
export type * from './types/platform';

// ── Platform ──────────────────────────────────────────────────────────
export { setCoreLogger, getCoreLogger, logInfo, logError, logWarn } from './platform/logger';

// ── AI ────────────────────────────────────────────────────────────────
export type { Message, ToolCall, Attachment } from './ai/message-types';
export type { StreamResult, ApiConfig, ToolDef as ApiToolDef } from './ai/api-client';
export { streamChat } from './ai/api-client';
export type { AgentCallbacks } from './ai/agent-loop';
export { runAgentLoop } from './ai/agent-loop';
export { createProvider } from './ai/provider-factory';
export { ModelSelector } from './ai/model-selector';
export { fetchModelList, fetchModelsForCurrentProvider } from './ai/model-fetcher';
export { StreamBridge } from './ai/stream-bridge';

// ── Tools ─────────────────────────────────────────────────────────────
export { buildTool, ToolRegistry } from './tools/registry';
export { diffFileTool } from './tools/diff-file';

// ── Config ────────────────────────────────────────────────────────────
export {
  getProviderPreset,
  getAllProviders,
  getProvidersByCategory,
  getModelsForProvider,
  getCategoryLabel,
  detectApiFormat,
  stripCompatSuffix,
  findPresetByURL,
  getModelListCandidates,
  resolveProviderConfig,
  buildProviderEnv,
} from './config/provider-presets';
export { parseClaudeConfig, stripAnsi, KNOWN_CONFIG_PATHS, resolveImportBaseURL } from './config/importer';
export type { ParsedConfig } from './config/importer';
export {
  buildSettingsFromPreset,
  generateEnvBlock,
  resolveSettingsProvider,
  createDefaultSettings,
  type AppSettings,
  type ProviderOverrides,
} from './config/settings-manager';
export { validateConfig } from './config/validator';

// ── Session ───────────────────────────────────────────────────────────
export {
  createSession,
  deleteSession,
  saveMessage,
  saveUserMessage,
  saveAssistantMessage,
  loadSessionMessages,
  loadHistory,
  appendMessage,
  saveFullHistory,
  loadSessionDiffs,
  maybePruneHistory,
  listSessions,
} from './session/history';

// ── Search ────────────────────────────────────────────────────────────
export { SemanticSearch, getSemanticSearch, initSemanticSearch } from './search/semantic-search';
export type { SearchFileProvider } from './search/semantic-search';
export { FileCache } from './search/cache';

// ── Utils ─────────────────────────────────────────────────────────────
export { computeDiffFromContent, computeDiffFromPaths } from './utils/diff-helper';
export { estimateTokens, estimateMessageTokens, trimContextToBudget, checkContextBudget } from './utils/token-counter';
export {
  setDevMode,
  logAiRequestStart,
  logAiFirstToken,
  logAiStreamProgress,
  logAiCompletion,
  logAiError,
  logToolCallStart,
  logToolCallResult,
  logCompletionRequest,
  logCompletionResult,
  logProviderConfig,
} from './utils/ai-logger';
export type { AiRequestLog, ToolCallLog, CompletionLog } from './utils/ai-logger';
