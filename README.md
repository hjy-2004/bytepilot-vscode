# BytePilot - VS Code AI 编程助手

[English](https://github.com/hjy-2004/bytepilot-vscode/blob/master/README_EN.md)

类 Cursor 的 AI 编程助手，完全运行在 VS Code 中。支持多 AI 提供商、内联代码补全、文件编辑、终端命令、可视化 diff 审批、多会话管理。

## 功能

- **Chat** — 侧边栏 AI 对话，流式响应，AI 自主决定何时停止
- **Inline Completion** — 输入停顿自动触发灰色补全，Tab 接受
- **Visual Diff & Approval** — 文件编辑前显示可视化 diff，内联审批（Appro/Reject），不再弹窗
- **File Editing** — 精准 `old_string → new_string` 替换，不重写整个文件
- **Tool System** — 8 个内置工具：read / write / edit / search / list / command / diagnostics / diff
- **Auto Config** — 首次启动自动读取 `.claude/settings.json`，零配置
- **Multi-Session** — JSONL 持久化，创建/切换/删除会话，工具调用和 diff 数据完整恢复
- **Multi-Provider** — Anthropic / OpenAI / DeepSeek / Ollama，自动检测和路由
- **Model Settings** — 点击标题栏模型标签，可视化切换 Provider / Model / Base URL / API Key
- **Structured Logging** — BytePilot 输出频道记录 AI 请求参数、工具调用、API 详情
- **@file References** — 输入 `@文件名` 自动搜索工作区文件，选中后附带文件内容作为上下文

## 快速开始

1. `Ctrl+Shift+P` → **Open AI Chat**，或点击左侧活动栏机器人图标
2. 已安装 Claude Code 则自动导入配置
3. 否则点击模型标签 → Custom → 填写 Provider / Model / API Key
4. 开始对话

## 安装

### 直接安装（推荐）

从 [Releases](https://github.com/hjy-2004/bytepilot-vscode/releases) 下载最新的 `.vsix` 文件，然后在 VS Code 中：

`Ctrl+Shift+P` → **Extensions: Install from VSIX** → 选择下载的文件

### 从源码

```bash
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode
npm install
cd webview-ui && npm install && cd ..
npm run build
```

用 VS Code 打开文件夹，**F5** 启动。

### VSIX 打包

```bash
npx vsce package
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
| `aiCodingAgent.maxAgentSteps` | `500` | Agent 循环安全上限 |
| `aiCodingAgent.toolApprovalLevel` | `writeOnly` | 审批级别: always / writeOnly / never |
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
│   ├── ai/                 # AI 核心（agent-loop, api-client, chat-engine, stream-bridge）
│   ├── tools/              # 8 个工具（含 diff_file）
│   ├── chat/               # 聊天面板、路由、JSONL 历史持久化
│   ├── context/            # 上下文收集器
│   ├── completion/         # InlineCompletionItemProvider (DeepSeek FIM)
│   ├── config/             # 设置、校验、导入
│   └── utils/              # ai-logger, diff-helper
├── webview-ui/             # React 聊天界面 (Vite + Zustand)
└── esbuild.config.mjs      # 扩展构建
```

## 技术栈

| 层 | 技术 |
|------|------|
| 扩展宿主 | TypeScript + VS Code API |
| AI 引擎 | 自建 Anthropic Messages API 客户端（`/anthropic/v1/messages`，SSE 流式） |
| Agent 循环 | 手动控制，AI 自主决定停止，500 步安全帽 |
| 工具审批 | 内联 diff 视图 + Approve/Reject，支持 edit_file/write_file 预览 |
| 内联补全 | DeepSeek FIM Beta (`/beta/completions`) |
| 聊天界面 | React 18 + Zustand + react-markdown |
| Diff | `diff` npm 库（unified diff + 行号 + 折叠） |
| 日志 | BytePilot 输出频道（AI 请求/工具调用/API 参数） |
| 构建 | esbuild (扩展) + Vite (WebView)，`npm run build` 一键编译 |
| 存储 | JSONL (`~/.ai-coding-agent/projects/`)

## 支持的厂商

| 厂商 | 对话 | 补全 | 工具 | 说明 |
|------|------|------|------|------|
| DeepSeek | ✅ | ✅ (`/beta` FIM) | ✅ | Anthropic 兼容端点 |
| Anthropic (Claude) | ✅ | ⚠️ 需扩展 | ✅ | Anthropic 原生 API |
| OpenAI (GPT) | ⚠️ 需适配 | ⚠️ 需扩展 | ⚠️ 需适配 | 需扩展 api-client 支持 OpenAI 格式 |
| Ollama | ⚠️ 需适配 | ⚠️ 需扩展 | ⚠️ 需适配 | 同上 |

## License

MIT
