# BytePilot - VS Code AI Coding Assistant

[中文](./README.md)

Cursor-like AI coding assistant running entirely in VS Code. Multi-provider support, inline completion, file editing with visual diff approval, terminal commands, and multi-session management.

## Features

- **Chat** — AI conversation with streaming, AI decides when to stop
- **Inline Completion** — Ghost-text suggestions on typing pause (Tab to accept)
- **Visual Diff & Approval** — Inline diff preview with Approve/Reject before every file edit, no modal popups
- **File Editing** — Precise `old_string → new_string` replacement (Claude Code style)
- **Tool System** — 8 built-in tools: read / write / edit / search / list / command / diagnostics / diff
- **Multi-Provider** — Full Anthropic / OpenAI / DeepSeek / Ollama support with automatic format routing
- **Image Paste & Upload** — Paste images from clipboard or click to upload from disk, vision model support
- **Project Rules** — Place `.bytepilotrules` in workspace root, auto-injected into AI system prompt
- **Auto Config** — Reads `.claude/settings.json` on first launch, zero setup
- **Multi-Session** — JSONL persistence with create/switch/delete, tool calls & diffs fully restored
- **Model Settings** — Click model badge to switch Provider / Model / Base URL / API Key
- **Structured Logging** — Unified BytePilot output channel, auto-opens in debug mode
- **@file References** — Type `@filename` to search workspace files, content auto-attached as context

## Quick Start

1. `Ctrl+Shift+P` → **Open AI Chat**, or click the robot icon in the activity bar
2. Auto-imported if Claude Code is installed
3. Otherwise click model badge → **Custom** → enter credentials
4. Start chatting

## Install

### Direct Install (Recommended)

Download the latest `.vsix` from [Releases](https://github.com/hjy-2004/bytepilot-vscode/releases), then in VS Code:

`Ctrl+Shift+P` → **Extensions: Install from VSIX** → select the file

### From Source

```bash
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Open in VS Code, press **F5**.

### VSIX Package

```bash
npx vsce package
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
| `aiCodingAgent.maxAgentSteps` | `500` | Agent loop safety cap |
| `aiCodingAgent.toolApprovalLevel` | `writeOnly` | Approval: always / writeOnly / never |
| `aiCodingAgent.completionsEnabled` | `true` | Enable completions |
| `aiCodingAgent.completionDebounceMs` | `300` | Completion trigger delay |
| `aiCodingAgent.completionTemperature` | `0.0` | Completion determinism |
| `aiCodingAgent.completionMaxTokens` | `256` | Completion limit |

## Project Rules (.bytepilotrules)

Create a `.bytepilotrules` file in your workspace root. Its content is injected into the AI system prompt on every request. Example:

```
- All functions must have JSDoc comments
- Use single quotes, not double quotes
- Indent with 2 spaces
- Use PascalCase for component files
```

A "Rules active" badge appears in the chat header when rules are loaded.

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
│   ├── ai/                 # AI core (agent-loop, api-client, chat-engine, stream-bridge)
│   ├── tools/              # 8 tools (incl. diff_file)
│   ├── chat/               # Panel, router, JSONL persistence
│   ├── context/            # Context collectors (incl. .bytepilotrules)
│   ├── completion/         # InlineCompletionItemProvider (multi-provider FIM)
│   ├── config/             # Settings, importer
│   └── utils/              # ai-logger, diff-helper
├── webview-ui/             # React UI (Vite + Zustand)
└── esbuild.config.mjs      # Extension build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | TypeScript + VS Code API |
| AI Engine | Multi-provider client (Anthropic Messages / OpenAI Chat / Ollama native, SSE streaming) |
| Agent Loop | Manual control, AI-driven stop, 500-step safety cap |
| Tool Approval | Inline diff + Approve/Reject, supports edit_file/write_file preview |
| Completion | DeepSeek FIM Beta + Ollama / OpenAI chat-based FIM |
| UI | React 18 + Zustand + react-markdown |
| Diff | `diff` npm library (unified diff + line numbers + collapse) |
| Logging | Unified BytePilot output channel (AI requests / tool calls / API params) |
| Build | esbuild + Vite, `npm run build` compiles both |
| Storage | JSONL (`~/.ai-coding-agent/projects/`) |

## Supported Providers

| Provider | Chat | Completion | Tools | Notes |
|----------|------|------------|-------|-------|
| DeepSeek | ✅ | ✅ (`/beta` FIM) | ✅ | Anthropic-compatible endpoint |
| Anthropic (Claude) | ✅ | ✅ (chat FIM) | ✅ | Native Anthropic API |
| OpenAI (GPT) | ✅ | ✅ (chat FIM) | ✅ | Native OpenAI API |
| Ollama | ✅ | ✅ (FIM) | ✅ | Local LLM, `/api/chat` native format |

## License

MIT
