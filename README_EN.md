# BytePilot - VS Code AI Coding Assistant

[中文](./README.md)

Cursor-like AI coding assistant running entirely in VS Code. Multi-provider support, inline completion, file editing, terminal commands, and multi-session management.

## Features

- **Chat** — AI conversation with streaming
- **Inline Completion** — Ghost-text suggestions on typing pause (Tab to accept)
- **File Editing** — Precise `old_string → new_string` replacement (Claude Code style)
- **Tool System** — 7 built-in tools: read / write / edit / search / list / command / diagnostics
- **Auto Config** — Reads `.claude/settings.json` on first launch, zero setup
- **Multi-Session** — JSONL persistence with create/switch/delete
- **Multi-Provider** — Anthropic / OpenAI / DeepSeek / Ollama, auto-detected and routed
- **Model Settings** — Click model badge to switch Provider / Model / Base URL / API Key

## Quick Start

1. `Ctrl+Shift+P` → **Open AI Chat**, or click the robot icon in the activity bar
2. Auto-imported if Claude Code is installed
3. Otherwise click model badge → **Custom** → enter credentials
4. Start chatting

## Install

### From Source

```bash
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode
npm install
cd webview-ui && npm install && npm run build && cd ..
npm run build
```

Open in VS Code, press **F5**.

### VSIX Package

```bash
npx vsce package
# Then Ctrl+Shift+P → Extensions: Install from VSIX
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodingAgent.provider` | `anthropic` | AI provider |
| `aiCodingAgent.chatModel` | `claude-sonnet-4-6` | Chat model ID |
| `aiCodingAgent.completionModel` | (empty) | Completion model (defaults to chat) |
| `aiCodingAgent.baseURL` | (empty) | Custom API endpoint |
| `aiCodingAgent.temperature` | `0.7` | Creativity |
| `aiCodingAgent.maxTokens` | `4096` | Response limit |
| `aiCodingAgent.completionsEnabled` | `true` | Enable completions |
| `aiCodingAgent.completionDebounceMs` | `300` | Completion trigger delay |
| `aiCodingAgent.completionTemperature` | `0.0` | Completion determinism |
| `aiCodingAgent.completionMaxTokens` | `256` | Completion limit |

## Commands

| Command | Description |
|---------|-------------|
| `Open AI Chat` | Open chat panel |
| `New AI Chat Session` | New session |
| `Configure AI Provider` | Set provider & key |
| `Test AI Provider Connection` | Verify connectivity |
| `Import Config from Claude/Cursor/Other` | Auto-import |
| `Reset Configuration` | Clear settings |
| `Show Current Configuration` | Debug info |
| `Explain Selected Code` | Chat: explain |
| `Fix Selected Code` | Chat: fix |
| `Generate Code` | Chat: generate |

## Architecture

```
extension_plugin/
├── src/                    # Extension host
│   ├── extension.ts        # Entry point
│   ├── ai/                 # AI core
│   ├── tools/              # 7 tools
│   ├── chat/               # Panel, router, JSONL persistence
│   ├── context/            # Context collectors
│   ├── completion/         # InlineCompletionItemProvider
│   └── config/             # Settings, importer
├── webview-ui/             # React UI (Vite + Zustand)
└── esbuild.config.mjs      # Extension build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | TypeScript + VS Code API |
| AI | Vercel AI SDK |
| Completion | DeepSeek FIM Beta (`/beta/completions`) |
| UI | React 18 + Zustand + react-markdown |
| Build | esbuild + Vite |
| Storage | JSONL (`~/.ai-coding-agent/projects/`)

## Completion

Inline completion uses DeepSeek FIM API:

```
POST https://api.deepseek.com/beta/completions
```

Other providers supported by extending `src/ai/completion-engine.ts`.

## Supported Providers

| Provider | Chat | Completion | Tools |
|----------|------|------------|-------|
| DeepSeek | ✅ (`/v1`) | ✅ (`/beta` FIM) | ✅ |
| Anthropic | ✅ | ⚠️ Extend | ✅ |
| OpenAI | ✅ | ⚠️ Extend | ✅ |
| Ollama | ✅ | ⚠️ Extend | ✅ |

## License

MIT
