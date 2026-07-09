# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

BytePilot is a Cursor-like AI coding assistant supporting VS Code extension and Tauri desktop. ~70% of code is shared in `@bytepilot/core`. Uses the Vercel AI SDK v4 for multi-provider LLM communication with a hand-rolled agent loop.

## Commands

```bash
# VS Code extension (full build: core → extension → webview)
npm run build

# Build subsets
npm run build:core          # tsc compile @bytepilot/core
npm run build:ext           # esbuild bundle extension
npm run build:webview       # Vite build webview UI (VS Code theme)
npm run build:webview:desktop  # Vite build webview UI (desktop theme)

# Watch (extension only)
npm run watch

# Lint & typecheck all workspaces
npx turbo run lint
npx turbo run typecheck

# Test (core only — compiles TypeScript then runs Node tests)
npm test -w @bytepilot/core
# Or via Turborepo:
npx turbo run test

# Package VSIX
npm run build && npx vsce package

# Tauri desktop dev
npm run build:webview
cd packages/tauri-app && npm install && npm run dev
```

## Architecture

### Monorepo layout

```
extension_plugin/
├── src/                         # VS Code extension entry (shim layer)
│   ├── extension.ts             # activate(): wires everything, registers commands
│   ├── ai/                      # ChatEngine, CompletionEngine, ProviderManager, SecretsStore
│   ├── chat/                    # ChatPanel (WebView host), MessageRouter (IPC dispatch)
│   ├── completion/              # InlineCompletionItemProvider
│   ├── config/                  # settings.ts (reads VS Code config), importer.ts
│   ├── context/                 # ContextCollector (open files, diagnostics, folder structure)
│   ├── tools/                   # Platform tool implementations (wraps VS Code APIs)
│   ├── types/                   # IPC message types
│   └── platform/                # VS Code adapters implementing core interfaces
│
├── packages/core/               # @bytepilot/core — framework-agnostic shared logic
│   └── src/
│       ├── ai/                  # agent-loop.ts, api-client.ts, provider-factory.ts, stream-bridge.ts
│       ├── tools/               # registry.ts, diff-file.ts, tool definitions
│       ├── config/              # 60+ provider presets, settings-manager, validator
│       ├── session/             # JSONL-based chat persistence
│       ├── search/              # BM25 semantic search
│       ├── types/               # Shared TypeScript interfaces (AI, IPC, platform, tools)
│       ├── platform/            # Abstract interfaces: ILogger, IFileSystem, IConfigStore
│       └── utils/               # token-counter, diff-helper, ai-logger
│
├── packages/tauri-app/          # @bytepilot/tauri-app — Tauri desktop
│   ├── src/                     # TS platform adapters + app entry
│   └── src-tauri/src/commands/  # Rust backend: fs.rs, config.rs, shell.rs, log.rs
│
├── webview-ui/                  # React 18 + Zustand 5 + Vite (shared by both platforms)
│   ├── platform/                # IPlatformAdapter — vscode.ts / tauri.ts (postMessage bridge)
│   ├── components/              # ChatContainer, DiffView, ModelSelector, etc.
│   ├── styles/                  # theme-vscode.css / theme-desktop.css
│   └── state/                   # Zustand stores
│
├── esbuild.config.mjs           # Bundles src/extension.ts → dist/extension.js
├── turbo.json                   # Turborepo pipeline (build depends on ^build)
└── .github/workflows/           # CI: typecheck + lint + build + 3-platform desktop
```

### Platform adapter pattern

Core defines abstract interfaces (`IFileSystem`, `IConfigStore`, `ILogger`, `IEditorHost`) in `packages/core/src/platform/`. Each platform implements them:

- **VS Code**: `src/platform/vscode-filesystem.ts`, `vscode-config.ts`, etc. — uses `vscode.workspace.fs`, `vscode.workspace.getConfiguration()`
- **Tauri**: `packages/tauri-app/src/` — uses `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-store`

The webview UI also follows this pattern: `webview-ui/src/platform/` has `vscode.ts` and `tauri.ts` implementing `IPlatformAdapter` for the postMessage bridge.

### Agent loop

The agent loop (`packages/core/src/ai/agent-loop.ts`) is hand-rolled, not using Vercel AI SDK's agent. It:
1. Sends chat request with tool definitions via `api-client.ts`
2. On tool-call response: requests approval (if configured), executes tool, appends result to history
3. Repeats until model emits a stop reason or hits `maxAgentSteps` (default 500)

The Vercel AI SDK (`ai` package v4) is used only for low-level `generateText()` / `streamText()` calls wrapped in `api-client.ts`.

### IPC message flow (VS Code)

```
WebView UI  ──postMessage──>  MessageRouter.handle()  ──>  ChatEngine / ToolRegistry / Config
            <──postMessage──                            <──
```

`MessageRouter` (`src/chat/router.ts`) is the central dispatch. It handles `chat.send`, `chat.cancel`, `config.*`, `tool.approve/reject`, `session.*`, `models.fetch`, and `files.search`. Both the sidebar WebView and the standalone ChatPanel route through the same router.

### Config storage

Settings are stored in `~/.bytepilot/settings.json` (shared across VS Code and desktop). VS Code settings (`aiCodingAgent.*`) act as a cache. On startup, `syncFromSettingsFile()` reconciles the two. API keys are stored per-provider in VS Code's `SecretStorage` (extension) or Tauri Store (desktop).

### Chat persistence

Sessions are stored as JSONL files under `~/.bytepilot/projects/<hashed-workspace-path>/`. Each session is a `.jsonl` file with one JSON object per line (one per message). History is loaded on startup and saved after each message.

### CJK token counting

`packages/core/src/utils/token-counter.ts` uses character-based estimation that accounts for CJK characters (~1.5 chars/token vs ~4 chars/token for ASCII). This is a heuristic, not an actual tokenizer.
