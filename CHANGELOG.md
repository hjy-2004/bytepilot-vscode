# Changelog

All notable changes to BytePilot will be documented in this file.

---

## [0.5.0] - 2026-06-29

### Added
- **Provider knowledge base (cc-switch integration)**: 60+ provider presets with base URLs, default models, API formats, categories, and icon mappings sourced from cc-switch.
- **Categorized provider picker**: 21 providers across 5 categories (Official, Chinese Official, Aggregator, Third-Party, Cloud) in both the Configure AI Provider command and ModelSelector UI.
- **Model list fetching**: Click 🔄 in ModelSelector to fetch live model lists from provider APIs via `GET /v1/models` (OpenAI-compatible) or Gemini's `models.list` endpoint with smart URL candidate generation.
- **Per-provider API keys**: API keys are now stored per effective provider (e.g. `deepseek`, `kimi`, `zhipu`) in SecretStorage. Switching providers auto-matches the correct key. Custom tab API key input now works via `config.setKey` IPC.
- **Smart API format detection**: Auto-detects Anthropic/OpenAI/Google/OpenAI-compatible protocols from baseURL patterns (16 URL matching rules from cc-switch).
- **Known compat suffixes**: Strips `/anthropic`, `/api/anthropic`, `/apps/anthropic`, `/api/coding`, `/api/claudecode`, `/step_plan`, `/claude`, `/coding` suffixes for model-fetch URL construction.
- **Gemini native streaming**: `streamChatGeminiNative()` for providers using Gemini generateContent API (POST `/v1beta/models/{model}:streamGenerateContent`).
- **Provider icon mappings**: 30 provider icons with brand colors (Anthropic #D4915D, OpenAI #00A67E, Google #4285F4, DeepSeek #1E88E5, etc.).
- **Model catalog**: Detailed model info with context limits, output limits, and modalities for Claude, OpenAI, Gemini, DeepSeek, Kimi, Zhipu, MiniMax, StepFun, Volcano, MiMo, Bedrock families.

### Fixed
- **Provider switch race condition**: `createChatEngine()` now awaits `providerManager.reload()` before reading the new model, preventing old models from being used after a switch.
- **BaseURL not clearing on provider switch**: `readClaudeConfigKey` now uses `!== undefined` instead of `!!` to distinguish empty-string (explicitly cleared) from unset. Empty baseURL is written as `undefined` to properly delete the config key.
- **`[1m]` suffix cleanup**: Model names are now cleaned (`deepseek-v4-pro[1m]` → `deepseek-v4-pro`) when reading from config and before sending to APIs.
- **Effective provider inference**: ModelSelector and ProviderManager now infer the actual provider from baseURL (e.g. `deepseek.com/anthropic` → provider DeepSeek), showing the correct model list and using the right API key slot.
- **Outdated models removed**: `deepseek-v3`, `deepseek-r1`, `deepseek-v4-pro[1m]` removed from built-in model lists to match current DeepSeek API (v4-pro, v4-flash only).

### Changed
- **ModelSelector UI**: Complete rewrite — shows 21 providers grouped by 5 categories with search filter, per-category provider chips, fetched model counts, and provider-aware model lists.
- **Provider defaults**: All 6 base providers now have explicit `defaultBaseURL` values (Anthropic `api.anthropic.com`, OpenAI `api.openai.com/v1`, Google `generativelanguage.googleapis.com`, DeepSeek `api.deepseek.com/v1`).
- **Expanded provider enum**: `package.json` now lists all 7 provider IDs including `openai-compatible` as a generic catch-all.
- **`PROVIDER_DEFAULTS` and `KNOWN_MODELS`**: Expanded from `Record<ProviderId, ...>` to `Record<string, ...>` with comprehensive model catalogs.

---

## [0.4.0] - 2026-06-27

### Added
- **Google Gemini & Azure OpenAI**: Gemini (`gemini-2.5-pro/flash`) via `@ai-sdk/google` and Azure OpenAI support in chat and completions.
- **Slash commands `/`**: Type `/` in chat input to access `/clear`, `/config`, `/sessions`, `/rules`, `/help` with dropdown selector.
- **Input history navigation**: Press `↑`/`↓` in chat input to cycle through up to 50 previous messages.
- **Semantic code search**: BM25 code search engine (`search_files` with `semantic: true`) for relevance-ranked results.
- **DeepSeek in config wizard**: DeepSeek now appears as a selectable provider in the configuration flow.
- **ESLint flat config**: Project-level linting with 0 errors.
- **GitHub Actions CI/CD**: CI pipeline (lint, build, test, package) on push; auto-release on tag push.
- **Diagnostic logging**: `[saveFullHistory]`, `[loadSessionMessages]`, `[extractRestoreMessages]` log entries for session debugging.

### Fixed
- **History persistence**: `saveFullHistory` and `appendMessage` now preserve `toolCallId` and `toolCalls` fields. Tool calls and diffs survive restarts.
- **Empty-content tool messages**: Assistant messages with tool calls but empty text (`content: ""`) are no longer dropped during load/restore.
- **`extractRestoreMessages` format**: Now handles both AI SDK internal format and BytePilot's flat `Message` format (with `m.toolCalls` property).
- **Completion debouncer**: Changed from drop-based to schedule-based — completions are delayed, never dropped.
- **DeepSeek completion routing**: When provider is `anthropic` with DeepSeek baseURL, completions correctly route to DeepSeek FIM endpoint instead of 404.
- **`execute_command` silent mode**: Terminal window no longer pops up for every command; only shown when `showTerminal: true`.

### Changed
- **Provider picker**: Configure AI Provider now lists all 6 supported providers (Anthropic, OpenAI, DeepSeek, Google, Azure OpenAI, Ollama).
- **Security: WebView API key isolation**: `config.set` no longer accepts `apiKey` from WebView. Keys can only be set via VS Code commands using `SecretStorage`.
- **Security: CSP hardened**: `unsafe-inline` removed from Content-Security-Policy.
- **Session storage**: Directory hashing upgraded from weak hashCode to SHA-256 with backward-compatible migration.

---

## [0.3.1] - 2026-06-25

### Added
- **Extended Thinking**: Anthropic extended thinking now enabled by default (configurable via `aiCodingAgent.thinkingBudget`, 0 = disabled). Redacted thinking blocks are correctly skipped in SSE parsing.
- **Prompt Caching**: Anthropic `cache_control: ephemeral` on system prompt and tool definitions for up to 90% cost savings on repeated requests.
- **API Retry**: Automatic exponential backoff retry (up to 3 attempts) for transient errors (429/502/503/504).
- **Token Counting**: Built-in token estimator with automatic context trimming when approaching model limits.
- **Colored Logging**: BytePilot output channel now uses VS Code's native log levels — blue (info), yellow (warn), red (error), gray (debug) — instead of all-white text.
- **UX Progress Indicators**: Chat UI now shows "Thinking..." immediately on send, smart status text ("Running: Edit File..."), real-time elapsed counter on tool cards, animated progress bars, and per-document tool execution dots.

### Fixed
- **Completion Routing**: Anthropic provider no longer routes to non-existent DeepSeek FIM endpoint; now uses chat-based fill-in-middle.
- **`isGenerating` Flag**: Chat engine's `isGenerating` is now reset in a `finally` block, preventing permanent lock-up on errors.
- **Debouncer**: Completion debounce state is now tracked per-document URI instead of globally, fixing false delays after switching tabs.
- **DeepSeek FIM URL**: Fixed double `/beta/beta/` path bug caused by chained `replace()` calls.
- **Dual OutputChannel**: `ai-logger.ts` now shares `logger.ts`'s channel instead of creating a duplicate; all AI logs are now visible.
- **Command Security**: Dangerous command detector expanded from 4 to 12 patterns, covering fork bombs, curl|sh pipe, chmod 777, disk formatting.
- **`search_files` OOM**: Added 256KB per-file size limit to prevent crash on large files.
- **`read_diagnostics`**: `filePath` parameter now searches ALL diagnostics, not just open tabs.
- **`execSync` → async**: Git diff in `diff-helper.ts` now uses async `exec()` to avoid blocking the extension host.
- **API Key Logging**: Removed API key prefix from debug/showConfig output.

### Changed
- **`thinkingBudget` setting**: New VS Code setting (default 4096, min 0, max 32000) to control extended thinking budget.
- **Timestamps in logs**: Switched from full ISO format to compact `HH:MM:SS.mmm` format.

---

## [0.3.0] - 2026-04

### Added
- Multi-provider API support (Anthropic/OpenAI/DeepSeek/Ollama)
- `.bytepilotrules` project rules file support
- Image paste & upload for vision models
- Visual diff & inline approval system
- Multi-session JSONL persistence

---

## [0.2.0] - 2026-03

### Added
- Inline code completions with debounce
- File editing with `oldString → newString` exact replacement
- Tool system: read/write/edit/search/list/command/diagnostics/diff
- Structured AI logging

---

## [0.1.0] - 2026-02

- Initial release: Chat panel, streaming responses, basic tool support
