# BytePilot - VS Code AI Coding Assistant

[中文](./README.md)

Cursor-like AI coding assistant running entirely in VS Code. Multi-provider support, inline completion, file editing with visual diff approval, terminal commands, and multi-session management.

## Features

- **Chat** — AI conversation with streaming, AI decides when to stop
- **Inline Completion** — Ghost-text suggestions on typing pause (Tab to accept)
- **Visual Diff & Approval** — Inline diff preview with Approve/Reject before every file edit, no modal popups
- **File Editing** — Precise `old_string → new_string` replacement (Claude Code style)
- **Tool System** — 8 built-in tools: read / write / edit / search / list / command / diagnostics / diff
- **Auto Config** — Reads `.claude/settings.json` on first launch, zero setup
- **Multi-Session** — JSONL persistence with create/switch/delete, tool calls & diffs fully restored
- **Multi-Provider** — Anthropic / OpenAI / DeepSeek / Ollama, auto-detected and routed
- **Model Settings** — Click model badge to switch Provider / Model / Base URL / API Key
- **Structured Logging** — BytePilot output channel logs AI requests, tool calls, API parameters
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
│   ├── ai/                 # AI core (agent-loop, api-client, chat-engine, stream-bridge, ai-logger)
│   ├── tools/              # 8 tools (incl. diff_file)
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
| AI Engine | Custom Anthropic Messages API client (SSE streaming) |
| Agent Loop | Manual control, AI-driven stop, 500-step safety cap |
| Tool Approval | Inline diff + Approve/Reject, supports edit_file/write_file preview |
| Completion | DeepSeek FIM Beta (`/beta/completions`) |
| UI | React 18 + Zustand + react-markdown |
| Diff | `diff` npm library (unified diff + line numbers + collapse) |
| Logging | BytePilot output channel (AI requests / tool calls / API params) |
| Build | esbuild + Vite, `npm run build` compiles both |
| Storage | JSONL (`~/.ai-coding-agent/projects/`)

## Supported Providers

| Provider | Chat | Completion | Tools |
|----------|------|------------|-------|
| DeepSeek | ✅ | ✅ (`/beta` FIM) | ✅ |
| Anthropic | ✅ | ⚠️ Extend | ✅ |
| OpenAI | ✅ | ⚠️ Extend | ✅ |
| Ollama | ✅ | ⚠️ Extend | ✅ |

## License

MIT
