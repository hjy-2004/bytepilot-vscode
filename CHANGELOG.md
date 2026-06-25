# Changelog

All notable changes to BytePilot will be documented in this file.

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
