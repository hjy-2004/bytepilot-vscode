# BytePilot - VS Code AI 编程助手

[English](https://github.com/hjy-2004/bytepilot-vscode/blob/master/README_EN.md)

Cursor-like AI coding assistant，完全运行在 VS Code 中。支持多 AI 提供商、内联代码补全、文件编辑、终端命令、多会话管理。

## 功能

- **Chat** — 侧边栏 AI 对话，流式响应
- **Inline Completion** — 输入停顿自动触发灰色补全，Tab 接受
- **File Editing** — 精准 `old_string → new_string` 替换，不重写整个文件（参考 Cursor/Claude Code 实现）
- **Tool System** — 7 个内置工具：read / write / edit / search / list / command / diagnostics
- **Auto Config** — 首次启动自动读取 `.claude/settings.json`，零配置
- **Multi-Session** — JSONL 持久化，创建/切换/删除会话，完整上下文保存
- **Multi-Provider** — Anthropic / OpenAI / DeepSeek / Ollama，自动检测和路由
- **Model Settings** — 点击标题栏模型标签，可视化切换 Provider / Model / Base URL / API Key

## 快速开始

1. `Ctrl+Shift+P` → **Open AI Chat**，或点击左侧活动栏机器人图标
2. 已安装 Claude Code 则自动导入配置
3. 否则点击模型标签 → Custom → 填写 Provider / Model / API Key
4. 开始对话

## 安装

### 从源码

```bash
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode
npm install
cd webview-ui && npm install && npm run build && cd ..
npm run build
```

用 VS Code 打开文件夹，**F5** 启动。

### VSIX 打包

```bash
npx vsce package
# 然后 Ctrl+Shift+P → Extensions: Install from VSIX
```

## 设置项

| 设置 | 默认 | 说明 |
|------|------|------|
| `aiCodingAgent.provider` | `anthropic` | 厂商 |
| `aiCodingAgent.chatModel` | `claude-sonnet-4-6` | 对话模型 |
| `aiCodingAgent.completionModel` | (空) | 补全模型（空=同对话） |
| `aiCodingAgent.baseURL` | (空) | 自定义 API 地址 |
| `aiCodingAgent.temperature` | `0.7` | 创造性 |
| `aiCodingAgent.maxTokens` | `4096` | 响应上限 |
| `aiCodingAgent.completionsEnabled` | `true` | 启用补全 |
| `aiCodingAgent.completionDebounceMs` | `300` | 补全延迟 |
| `aiCodingAgent.completionTemperature` | `0.0` | 补全确定性 |
| `aiCodingAgent.completionMaxTokens` | `256` | 补全上限 |

## 命令

| 命令 | 说明 |
|------|------|
| `Open AI Chat` | 打开聊天 |
| `New AI Chat Session` | 新建会话 |
| `Configure AI Provider` | 配置厂商和密钥 |
| `Test AI Provider Connection` | 测试连接 |
| `Import Config from Claude/Cursor/Other` | 导入配置 |
| `Reset Configuration` | 重置设置 |
| `Show Current Configuration` | 诊断 |
| `Explain Selected Code` | 解释代码 |
| `Fix Selected Code` | 修复代码 |
| `Generate Code` | 生成代码 |

## 架构

```
extension_plugin/
├── src/                    # 扩展宿主 (TypeScript)
│   ├── extension.ts        # 入口
│   ├── ai/                 # AI 核心 (chat-engine, completion-engine, provider, stream-bridge)
│   ├── tools/              # 7 个工具
│   ├── chat/               # 聊天面板、路由、JSONL 历史持久化
│   ├── context/            # 上下文收集器
│   ├── completion/         # InlineCompletionItemProvider (DeepSeek FIM)
│   └── config/             # 设置、校验、导入
├── webview-ui/             # React 聊天界面 (Vite + Zustand)
└── esbuild.config.mjs      # 扩展构建
```

## 技术栈

| 层 | 技术 |
|------|------|
| 扩展宿主 | TypeScript + VS Code API |
| AI 框架 | Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) |
| 内联补全 | DeepSeek FIM Beta (`/beta/completions`) |
| 聊天界面 | React 18 + Zustand + react-markdown |
| 构建 | esbuild (扩展) + Vite (WebView) |
| 存储 | JSONL (`~/.ai-coding-agent/projects/`)

## 补全校准

内联补全基于 DeepSeek FIM (Fill-in-the-Middle) API：

```
POST https://api.deepseek.com/beta/completions
{ model, prompt (prefix), suffix, max_tokens, temperature }
```

其他厂商的补全可通过扩展 `src/ai/completion-engine.ts` 实现。

## 支持的厂商

| 厂商 | 对话 | 补全 | 工具 |
|------|------|------|------|
| DeepSeek | ✅ (`/v1` 协议) | ✅ (`/beta` FIM) | ✅ |
| Anthropic (Claude) | ✅ | ⚠️ 需扩展 | ✅ |
| OpenAI (GPT) | ✅ | ⚠️ 需扩展 | ✅ |
| Ollama | ✅ | ⚠️ 需扩展 | ✅ |

DeepSeek 自动检测并路由到最优协议。通过模型设置面板可随时切换。

## License

MIT
