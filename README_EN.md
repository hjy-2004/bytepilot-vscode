# AI Coding Agent - VS Code Extension

Cursor-like AI coding assistant that runs entirely in VS Code. Supports multiple AI providers, inline code completion, file editing, and terminal commands.

## Features

- **Chat**: Sidebar AI conversation with streaming support
- **Inline Completion**: Ghost-text style code suggestions (Tab to accept)
- **File Editing**: Precise `old_string → new_string` replacements (no full rewrites)
- **Tool System**: 7 built-in tools — read/write/edit files, search code, list directories, execute commands, read diagnostics
- **Auto Config**: Reads `.claude/settings.json` automatically on first launch
- **Multi-Session**: JSONL-based chat history with create/switch/delete sessions
- **Multi-Provider**: Anthropic, OpenAI, Ollama, DeepSeek (auto-detected)
- **Zero Config**: Works out of the box if you have Claude Code installed

## Install

### From VSIX (Local Build)

```bash
cd D:\extension_plugin
npm install
cd webview-ui && npm install && npm run build && cd ..
npm run build
npx vsce package
```

Then in VS Code: `Ctrl+Shift+P` → `Extensions: Install from VSIX` → select the `.vsix` file.

### From Source (Development)

```bash
git clone <repo-url>
cd extension_plugin
npm install
cd webview-ui && npm install && cd ..
```

Open in VS Code, press **F5** to start the Extension Development Host.

## Quick Start

1. Press `Ctrl+Shift+P` → **Open AI Chat** (or click the robot icon in the activity bar)
2. If you have Claude Code installed, config is auto-imported
3. Otherwise: `Config Import from Claude/Cursor/Other` or `Configure AI Provider`
4. Start chatting

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodingAgent.provider` | `anthropic` | AI provider (openai, anthropic, ollama) |
| `aiCodingAgent.chatModel` | `claude-sonnet-4-6` | Chat model ID |
| `aiCodingAgent.completionModel` | (empty) | Completion model (uses chat if empty) |
| `aiCodingAgent.baseURL` | (empty) | Custom API endpoint |
| `aiCodingAgent.temperature` | `0.7` | Chat creativity (0-2) |
| `aiCodingAgent.maxTokens` | `4096` | Max tokens per response |
| `aiCodingAgent.completionsEnabled` | `true` | Enable inline completions |
| `aiCodingAgent.completionDebounceMs` | `300` | Typing delay before completion triggers |
| `aiCodingAgent.completionTemperature` | `0.0` | Completion determinism |
| `aiCodingAgent.completionMaxTokens` | `256` | Max completion tokens |
| `aiCodingAgent.contextProviders` | `{}` | Context sources (code, problems, folder) |

## Commands

| Command | Description |
|---------|-------------|
| `AI: Open Chat` | Open the chat sidebar |
| `AI: New Chat Session` | Start a new conversation |
| `AI: Configure AI Provider` | Select provider and API key |
| `AI: Test AI Provider Connection` | Verify API connectivity |
| `AI: Import Config from Claude/Cursor/Other` | Auto-import settings |
| `AI: Reset Configuration` | Clear all settings |
| `AI: Show Current Configuration` | Debug current setup |
| `AI: Debug Sessions` | Show stored sessions info |
| `AI: Explain Selected Code` | Chat: explain selection |
| `AI: Fix Selected Code` | Chat: fix selection |
| `AI: Generate Code` | Chat: generate from prompt |

## Architecture

```
extension_plugin/
├── src/                    # Extension host (TypeScript)
│   ├── extension.ts        # Entry point
│   ├── ai/                 # AI core (chat engine, completion engine, provider)
│   ├── tools/              # 7 tools (read, write, edit, search, list, command, diagnostics)
│   ├── chat/               # Chat panel, router, history (JSONL persistence)
│   ├── context/            # Context collectors (open files, project structure, diagnostics)
│   ├── completion/         # InlineCompletionItemProvider
│   └── config/             # Settings, validator, importer
├── webview-ui/             # React chat UI (Vite)
│   └── src/components/     # ChatContainer, MessageList, SessionSelector, etc.
├── package.json            # Extension manifest
└── esbuild.config.mjs      # Extension build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension Host | TypeScript + VS Code API |
| AI Framework | Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) |
| Completion | DeepSeek FIM Beta API (`/beta/completions`) |
| Chat UI | React 18 + Zustand + react-markdown |
| Chat Build | Vite |
| Extension Build | esbuild |
| Storage | JSONL files (`~/.ai-coding-agent/projects/<hash>/<session>.jsonl`) |

## Inline Completion

Inline code completion uses **DeepSeek's FIM (Fill-in-the-Middle) Beta API**:

```
POST https://api.deepseek.com/beta/completions
{ model, prompt (prefix), suffix, max_tokens, temperature }
```

This is separate from the Chat API — FIM accepts prefix + suffix and fills the middle.

> **Note**: Completion is currently DeepSeek-specific. To support OpenAI / Anthropic completions, extend `src/ai/completion-engine.ts`.

## Supported Providers

| Provider | Chat | Inline Completion | Tool Calling |
|----------|------|-------------------|--------------|
| DeepSeek | ✅ (OpenAI `/v1` protocol) | ✅ (FIM `/beta` protocol) | ✅ |
| Anthropic (Claude) | ✅ | ⚠️ (needs extension) | ✅ |
| OpenAI (GPT) | ✅ | ⚠️ (needs extension) | ✅ |
| Ollama | ✅ | ⚠️ (needs extension) | ✅ |

DeepSeek is auto-detected from `.claude/settings.json` and routed to the optimal protocol.

## License

MIT
