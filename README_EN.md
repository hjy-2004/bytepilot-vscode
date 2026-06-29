# BytePilot - VS Code AI Coding Assistant

[中文](./README.md)

Cursor-like AI coding assistant running entirely in VS Code. Supports 60+ AI provider presets (from cc-switch), inline code completion, file editing with visual diff approval, terminal commands, and multi-session management.

## Features

- **Chat** — AI conversation with streaming, AI decides when to stop
- **Inline Completion** — Ghost-text suggestions on typing pause (Tab to accept)
- **Visual Diff & Approval** — Inline diff preview with Approve/Reject before every file edit
- **File Editing** — Precise `old_string → new_string` replacement (Claude Code style)
- **Tool System** — 8 built-in tools: read / write / edit / search / list / command / diagnostics / diff
- **Multi-Provider** — 60+ provider presets: Anthropic / OpenAI / DeepSeek / Google Gemini / Azure OpenAI / Ollama, plus Kimi / Zhipu GLM / MiniMax / StepFun / Volcano / OpenRouter / SiliconFlow and more
- **Provider Categories** — 5 categories (Official / Chinese Official / Aggregator / Third-Party / Cloud)
- **Model Fetching** — Click 🔄 to fetch live model lists from provider APIs (OpenAI & Gemini formats supported)
- **Per-Provider API Key** — Store API keys independently per provider, auto-matched on provider switch
- **Slash Commands `/`** — Type `/` for command menu (`/clear` `/config` `/sessions` `/rules` `/help`)
- **Input History** — Press `↑`/`↓` in chat input to navigate up to 50 previous messages
- **Image Paste & Upload** — Paste images from clipboard or click to upload from disk
- **Semantic Search** — BM25 code search engine, `search_files` with `semantic: true` for relevance ranking
- **Project Rules** — Place `.bytepilotrules` in workspace root, auto-injected into AI system prompt
- **Auto Config** — Reads `.claude/settings.json` on first launch, zero setup
- **Multi-Session** — JSONL persistence with create/switch/delete, tool calls & diffs fully restored
- **Incremental Saving** — Each tool result written to disk immediately, no data loss on crash
- **Model Settings** — Click model badge to switch Provider / Model / Base URL / API Key
- **Smart API Routing** — Auto-detects API protocol (Anthropic / OpenAI / Google / OpenAI-compatible), 16 URL matching rules
- **Structured Logging** — Unified BytePilot output channel with session diagnostics
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
| `aiCodingAgent.provider` | `anthropic` | AI provider (anthropic/openai/deepseek/google/azure-openai/ollama/openai-compatible) |
| `aiCodingAgent.chatModel` | `claude-sonnet-4-6` | Chat model ID |
| `aiCodingAgent.completionModel` | (empty) | Completion model (defaults to chat) |
| `aiCodingAgent.baseURL` | (empty) | Custom API endpoint |
| `aiCodingAgent.temperature` | `0.7` | Creativity |
| `aiCodingAgent.maxTokens` | `4096` | Response limit |
| `aiCodingAgent.thinkingBudget` | `4096` | Extended thinking budget (0=disabled) |
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
│   ├── ai/                 # AI core (agent-loop, api-client, chat-engine, model-fetcher)
│   ├── tools/              # 8 tools (incl. diff_file)
│   ├── chat/               # Panel, router, JSONL persistence
│   ├── context/            # Context collectors (incl. .bytepilotrules)
│   ├── completion/         # InlineCompletionItemProvider (multi-provider FIM)
│   ├── config/             # Settings, importer, provider presets (60+ providers)
│   └── utils/              # ai-logger, diff-helper
├── webview-ui/             # React UI (Vite + Zustand, model fetching)
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

### Official

| Provider | Chat | Completion | Tools | Notes |
|----------|------|------------|-------|-------|
| Anthropic (Claude) | ✅ | ✅ (chat FIM) | ✅ | Native API + prompt caching + extended thinking |
| OpenAI (GPT) | ✅ | ✅ (chat FIM) | ✅ | Native API |
| DeepSeek | ✅ | ✅ (`/beta` FIM) | ✅ | OpenAI-compatible endpoint, auto format routing |
| Google (Gemini) | ✅ | ✅ (chat FIM) | ✅ | Via `@ai-sdk/google` |
| Azure OpenAI | ✅ | ✅ (chat FIM) | ✅ | Custom resource + deployment |
| Ollama | ✅ | ✅ (FIM) | ✅ | Local LLM, `/api/chat` native format |

### Chinese Official & Aggregators (built-in presets from cc-switch)

| Provider | Notes |
|----------|-------|
| Kimi (Moonshot) | `api.moonshot.cn/v1`, kimi-k2.7-code |
| Kimi For Coding | `api.kimi.com/coding`, Anthropic-compatible endpoint |
| Zhipu GLM | `open.bigmodel.cn` / `api.z.ai`, glm-5.1 |
| MiniMax | `api.minimaxi.com/v1` / `api.minimax.io/v1` |
| StepFun | `api.stepfun.com/step_plan/v1` |
| Volcano AgentPlan | `ark.cn-beijing.volces.com/api/coding/v3` |
| DouBao Seed | `ark.cn-beijing.volces.com/api/v3` |
| Bailian (Alibaba) | `dashscope.aliyuncs.com/compatible-mode/v1` |
| Baidu Qianfan | `qianfan.baidubce.com/anthropic/coding` |
| Xiaomi MiMo | `api.xiaomimimo.com/v1` |
| OpenRouter | Multi-model aggregation router |
| SiliconFlow | Chinese aggregation provider |
| Shengsuanyun / AiHubMix / CherryIN | Community providers |

See ModelSelector dropdown for the full list (21 providers total).

### Automatic API Format Detection

The extension auto-detects API protocol (Anthropic Messages / OpenAI Chat / Google Gemini / OpenAI-compatible) from the baseURL. Supports stripping 9 common compatible URL suffixes (`/anthropic`, `/api/anthropic`, `/apps/anthropic`, `/api/coding`, `/api/claudecode`, `/step_plan`, `/claude`, `/coding`).

## License

MIT
