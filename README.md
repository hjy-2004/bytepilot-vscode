# AI Coding Agent - VS Code 扩展

[English](./README_EN.md)

类似 Cursor 的 AI 编程助手，完全运行在 VS Code 中。支持多 AI 提供商、内联代码补全、文件编辑和终端命令。

## 功能

- **对话**：侧边栏 AI 对话，流式响应
- **内联补全**：灰色代码建议，Tab 接受
- **文件编辑**：精准 `old_string → new_string` 替换，不重写整个文件
- **工具系统**：7 个内置工具 — 读取/写入/编辑文件、搜索代码、列目录、执行命令、读取诊断
- **自动配置**：首次启动自动读取 `.claude/settings.json`
- **多会话**：JSONL 存储的聊天历史，创建/切换/删除会话
- **多厂商**：Anthropic、OpenAI、Ollama、DeepSeek（自动检测）
- **零配置**：安装 Claude Code 后开箱即用

## 安装

### 本地构建 (VSIX)

```bash
cd D:\extension_plugin
npm install
cd webview-ui && npm install && npm run build && cd ..
npm run build
npx vsce package
```

在 VS Code 中：`Ctrl+Shift+P` → `Extensions: Install from VSIX` → 选择 `.vsix` 文件。

### 开发模式

```bash
git clone <repo-url>
cd extension_plugin
npm install
cd webview-ui && npm install && cd ..
```

用 VS Code 打开文件夹，按 **F5** 启动扩展开发主机。

## 快速开始

1. `Ctrl+Shift+P` → **AI: Open Chat**（或点击左侧活动栏机器人图标）
2. 已安装 Claude Code 则自动导入配置
3. 否则：`AI: Import Config from Claude/Cursor/Other` 或 `AI: Configure AI Provider`
4. 开始对话

## 设置项

| 设置 | 默认值 | 说明 |
|---------|-------------|---------|
| `aiCodingAgent.provider` | `anthropic` | AI 厂商 (openai, anthropic, ollama) |
| `aiCodingAgent.chatModel` | `claude-sonnet-4-6` | 对话模型 ID |
| `aiCodingAgent.completionModel` | (空) | 补全模型（空则用对话模型） |
| `aiCodingAgent.baseURL` | (空) | 自定义 API 地址 |
| `aiCodingAgent.temperature` | `0.7` | 对话创造性 (0-2) |
| `aiCodingAgent.maxTokens` | `4096` | 每次响应最大 token |
| `aiCodingAgent.completionsEnabled` | `true` | 启用内联补全 |
| `aiCodingAgent.completionDebounceMs` | `300` | 输入停止后触发补全延迟 |
| `aiCodingAgent.completionTemperature` | `0.0` | 补全确定性 |
| `aiCodingAgent.completionMaxTokens` | `256` | 补全最大 token |
| `aiCodingAgent.contextProviders` | `{}` | 上下文来源 (code, problems, folder) |

## 命令

| 命令 | 说明 |
|---------|-------------|
| `AI: Open Chat` | 打开聊天侧边栏 |
| `AI: New Chat Session` | 新建对话 |
| `AI: Configure AI Provider` | 选择厂商和 API Key |
| `AI: Test AI Provider Connection` | 测试 API 连通性 |
| `AI: Import Config from Claude/Cursor/Other` | 自动导入配置 |
| `AI: Reset Configuration` | 清除所有设置 |
| `AI: Show Current Configuration` | 调试当前配置 |
| `AI: Debug Sessions` | 查看存储的会话 |
| `AI: Explain Selected Code` | 对话：解释选中代码 |
| `AI: Fix Selected Code` | 对话：修复选中代码 |
| `AI: Generate Code` | 对话：生成代码 |

## 架构

```
extension_plugin/
├── src/                    # 扩展宿主 (TypeScript)
│   ├── extension.ts        # 入口
│   ├── ai/                 # AI 核心 (chat-engine, completion-engine, provider)
│   ├── tools/              # 7 个工具 (read, write, edit, search, list, command, diagnostics)
│   ├── chat/               # 聊天面板、路由、历史 (JSONL 持久化)
│   ├── context/            # 上下文收集器 (打开文件, 项目结构, 诊断)
│   ├── completion/         # InlineCompletionItemProvider
│   └── config/             # 设置、校验、导入
├── webview-ui/             # React 聊天界面 (Vite)
│   └── src/components/     # ChatContainer, MessageList, SessionSelector 等
├── package.json            # 扩展清单
└── esbuild.config.mjs      # 扩展构建
```

## 技术栈

| 层 | 技术 |
|-------|------------|
| 扩展宿主 | TypeScript + VS Code API |
| AI 框架 | Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) |
| 补全 | DeepSeek FIM Beta API (`/beta/completions`) |
| 聊天界面 | React 18 + Zustand + react-markdown |
| 聊天构建 | Vite |
| 扩展构建 | esbuild |
| 存储 | JSONL 文件 (`~/.ai-coding-agent/projects/<hex>/<session>.jsonl`) |

## 代码补全说明

内联代码补全当前基于 **DeepSeek FIM (Fill-in-the-Middle)** 实现，直接调用 DeepSeek 的 Beta API：

```
POST https://api.deepseek.com/beta/completions
{ model, prompt (prefix), suffix, max_tokens, temperature }
```

这与对话使用的 Chat API 不同——补全使用专用的 FIM 端点，支持前缀+后缀的填充模式。

> **注意**：补全功能目前专为 DeepSeek 实现。如需使用 OpenAI / Anthropic 的补全，可参照 `src/ai/completion-engine.ts` 扩展。

## 支持的厂商

| 厂商 | 对话 | 内联补全 | 工具调用 |
|----------|------|-------------------|--------------|
| DeepSeek | ✅ (OpenAI `/v1` 协议) | ✅ (FIM `/beta` 协议) | ✅ |
| Anthropic (Claude) | ✅ | ⚠️ (需扩展) | ✅ |
| OpenAI (GPT) | ✅ | ⚠️ (需扩展) | ✅ |
| Ollama | ✅ | ⚠️ (需扩展) | ✅ |

DeepSeek 会自动检测（从 `.claude/settings.json` 或手动配置 `baseURL`），并路由到最优协议。

## 许可

MIT
