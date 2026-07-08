# BytePilot - AI Coding Assistant

[中文](./README.md)

Cursor-like AI coding assistant supporting both **VS Code extension** and **Tauri desktop** platforms. 70-80% core code shared via `@bytepilot/core`. Supports 60+ AI provider presets, inline code completion, file editing with visual diff approval, and multi-session management.

## Platforms

| Platform | Package | Size |
|----------|---------|------|
| VS Code Extension | `.vsix` | ~1.3 MB |
| Windows Desktop | `.exe` (Tauri) | ~14 MB |
| macOS Desktop | `.dmg` (Tauri) | ~10 MB |
| Linux Desktop | `.deb` / `.AppImage` (Tauri) | ~8 MB |

## Features

- **Chat** — AI conversation with streaming, AI decides when to stop
- **Inline Completion** — Ghost-text suggestions on typing pause (Tab to accept)
- **Visual Diff & Approval** — Inline diff preview with Approve/Reject
- **File Editing** — Precise `old_string → new_string` replacement (Claude Code style)
- **Tool System** — 8 built-in tools: read / write / edit / search / list / command / diagnostics / diff
- **Multi-Provider** — 60+ provider presets: Anthropic / OpenAI / DeepSeek / Google Gemini / Azure OpenAI / Ollama, plus Kimi / Zhipu / MiniMax / StepFun / Volcano / OpenRouter / SiliconFlow and more
- **Model Fetching** — Click 🔄 to fetch live model lists from provider APIs
- **Config Import** — Auto-scans for Claude Code, Cursor configs on first launch — one-click import of provider, model, and API key
- **Per-Provider API Key** — API keys stored in `~/.bytepilot/settings.json` for easy manual editing and cross-tool sharing
- **Shared Config** — VS Code extension and desktop app share `~/.bytepilot/settings.json` — configure once, available everywhere
- **Empty by Default** — No pre-selected provider or model on first launch; the user must explicitly configure before the config file is populated
- **Keyword Search** — BM25-based code search engine (not semantic/embedding search)
- **CJK Token Counting** — CJK-aware token estimation (~1.5 chars/token for Chinese/Japanese/Korean, ~4 for ASCII)
- **Theme Customization** — Desktop app supports custom themes with light/dark presets and 50+ adjustable color variables
- **Structured Logging** — File-based logging on desktop (`%APPDATA%/BytePilot/logs/`)
- **Cross-Platform** — 70%+ code shared between VS Code plugin and Tauri desktop app
- **Security** — Workspace boundary checks (canonicalized to block `..` traversal, unified across both platforms), dangerous-command interception on both platforms, shell timeout process kill, and consent-gated execution of `apiKeyHelper` during config import

## Quick Start

### VS Code Extension

1. Download `.vsix` from [Releases](https://github.com/hjy-2004/bytepilot-vscode/releases)
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX**
3. Click robot icon in activity bar → configure provider & API key
4. Start chatting

### Desktop App

Download the installer for your platform from [Releases](https://github.com/hjy-2004/bytepilot-vscode/releases).

Or run from source:

```bash
# Install Rust first: https://rustup.rs
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode
npm install
npm run build:webview
cd packages/tauri-app && npm install && npm run dev
```

## Build from Source

```bash
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode

# VS Code Extension
npm install
npm run build            # builds core + extension + webview
npx vsce package         # produces .vsix

# Tauri Desktop
npm run build:webview
cd packages/tauri-app && npm install && npm run build
```

Open in VS Code, press **F5** to debug the extension.

## Architecture

```
extension_plugin/
├── packages/
│   ├── core/                      # @bytepilot/core — shared logic (TS, tsc)
│   │   ├── ai/                    # agent-loop, api-client, stream-bridge, ...
│   │   ├── tools/                 # registry, diff-file, definitions
│   │   ├── session/               # JSONL persistence
│   │   ├── search/                # BM25 keyword search
│   │   ├── config/                # 60+ provider presets + config import parser
│   │   ├── types/                 # IPC, AI, providers, platform interfaces
│   │   └── platform/              # ILogger, IFileSystem, IConfigStore, ...
│   │
│   └── tauri-app/                 # @bytepilot/tauri-app — Desktop app
│       ├── src/                   # TS platform adapters
│       ├── src-tauri/             # Rust backend (FS, Shell, Config, Logging)
│       └── src-tauri/src/commands/  # fs.rs, config.rs, shell.rs, log.rs
│
├── src/                           # VS Code extension (shim → @bytepilot/core)
│   ├── platform/                  # VSCodeFileSystem, VSCodeConfigStore, ...
│   ├── ai/                        # chat-engine, completion-engine
│   ├── tools/                     # 7 platform-specific tool implementations
│   ├── completion/                # InlineCompletionItemProvider
│   └── extension.ts               # Entry point
│
├── webview-ui/                    # Shared React UI (Vite + Zustand)
│   ├── platform/                  # IPlatformAdapter (vscode / tauri)
│   ├── styles/                    # theme-vscode.css / theme-desktop.css
│   └── components/                # ChatContainer, DiffView, ModelSelector, ...
│
├── turbo.json                     # Turborepo parallel builds
├── esbuild.config.mjs             # Extension build
└── .github/workflows/             # CI/CD (typecheck + lint + build + desktop)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| VS Code Extension | TypeScript + VS Code API |
| Tauri Desktop | Rust + Tauri v2 (14MB binary) |
| AI Engine | Multi-protocol HTTP (Anthropic/OpenAI/Gemini/Ollama, SSE streaming) |
| Agent Loop | Manual control, AI-driven stop, 500-step safety cap |
| UI | React 18 + Zustand + react-markdown, CSS semantic tokens |
| Build | Turborepo + esbuild (ext) + Vite (webview) + Cargo (desktop) |
| CI/CD | GitHub Actions (typecheck, lint, 3-platform desktop, VS Code Marketplace) |

## Theme Settings (Desktop)

The desktop app includes a built-in theme editor — click the gear icon in the sidebar:

- **Presets**: Light and Dark modes, switch instantly
- **Custom colors**: 50+ CSS variables across 9 categories, use the native color picker
- **Live preview**: Changes apply immediately, no restart needed
- **Reset**: One-click restore to default colors
- **Persistence**: Theme settings saved to localStorage

## Desktop Logging

Desktop logs are written to `%APPDATA%/BytePilot/logs/bytepilot.log` with automatic rotation at 1MB.

Press **F12** in the Tauri window to open DevTools → Console for real-time logs.

## Configuration File

Both the extension and desktop app share `~/.bytepilot/settings.json`. An **empty placeholder is auto-created on first launch** and populated when the user configures a provider:

```json
{
  "provider": "deepseek",
  "providerName": "DeepSeek",
  "apiFormat": "openai_compat",
  "baseURL": "https://api.deepseek.com/v1",
  "chatModel": "deepseek-v4-pro",
  "completionModel": "deepseek-v4-pro",
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "OPENAI_BASE_URL": "https://api.deepseek.com/v1",
    "API_TIMEOUT_MS": "3000000"
  }
}
```

The `env` block is compatible with `.claude/settings.json` format for CLI tool interop.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodingAgent.provider` | (empty) | AI provider — must be manually selected |
| `aiCodingAgent.chatModel` | (empty) | Chat model |
| `aiCodingAgent.completionModel` | (empty) | Completion model |
| `aiCodingAgent.baseURL` | (empty) | Custom API endpoint |
| `aiCodingAgent.temperature` | `0.7` | Creativity |
| `aiCodingAgent.maxTokens` | `4096` | Response limit |
| `aiCodingAgent.thinkingBudget` | `4096` | Extended thinking budget |
| `aiCodingAgent.maxAgentSteps` | `500` | Agent loop safety cap |
| `aiCodingAgent.toolApprovalLevel` | `writeOnly` | Tool approval level |
| `aiCodingAgent.completionsEnabled` | `true` | Enable inline completions |
| `aiCodingAgent.contextLength` | `128000` | Context window size (tokens) |

## Testing

```bash
# Run all core tests in one command (compiles, then runs token counting /
# API message conversion / config validation tests)
npm test -w @bytepilot/core

# Or via Turborepo (same command CI uses)
npx turbo run test
```

## Supported Providers

### Official

| Provider | Chat | Completion | Tools | Notes |
|----------|------|------------|-------|-------|
| Anthropic (Claude) | ✅ | ✅ (chat FIM) | ✅ | Native API + prompt caching |
| OpenAI (GPT) | ✅ | ✅ (chat FIM) | ✅ | Native API |
| DeepSeek | ✅ | ✅ (`/beta` FIM) | ✅ | OpenAI-compatible |
| Google (Gemini) | ✅ | ✅ (chat FIM) | ✅ | Via `@ai-sdk/google` |
| Azure OpenAI | ✅ | ✅ (chat FIM) | ✅ | Custom resource + deployment |
| Ollama | ✅ | ✅ (FIM) | ✅ | Local LLM |

### Chinese Official & Aggregators

Kimi (Moonshot) · Kimi For Coding · Zhipu GLM · MiniMax · StepFun · Volcano AgentPlan · DouBao Seed · Bailian (Alibaba) · Baidu Qianfan · Xiaomi MiMo · OpenRouter · SiliconFlow · Shengsuanyun · AiHubMix · CherryIN — 21 providers total with built-in presets from cc-switch.

## License

MIT
