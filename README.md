# BytePilot - AI 编程助手

[English](./README_EN.md)

类 Cursor 的 AI 编程助手，支持 **VS Code 插件**和 **Tauri 桌面端**双平台。70-80% 核心代码共享于 `@bytepilot/core`。支持 60+ AI 供应商预设、内联代码补全、文件编辑、可视化 diff 审批、多会话管理。

## 平台

| 平台 | 安装包 | 大小 |
|------|--------|------|
| VS Code 插件 | `.vsix` | ~1.3 MB |
| Windows 桌面 | `.exe` (Tauri) | ~14 MB |
| macOS 桌面 | `.dmg` (Tauri) | ~10 MB |
| Linux 桌面 | `.deb` / `.AppImage` (Tauri) | ~8 MB |

## 功能

- **Chat** — AI 对话，流式响应，AI 自主决定何时停止
- **Inline Completion** — 输入停顿自动触发灰色补全，Tab 接受
- **Visual Diff & Approval** — 文件编辑前显示可视化 diff，内联审批（Approve/Reject）
- **File Editing** — 精准 `old_string → new_string` 替换（Claude Code 风格）
- **Tool System** — 8 个内置工具：read / write / edit / search / list / command / diagnostics / diff
- **Multi-Provider** — 60+ 供应商预设，支持 Anthropic / OpenAI / DeepSeek / Google Gemini / Azure OpenAI / Ollama / Kimi / 智谱 / MiniMax / 阶跃星辰 / 火山方舟 / OpenRouter / SiliconFlow 等
- **Provider Categories** — 供应商按 5 大分类展示（官方 / 国产官方 / 聚合商 / 第三方 / 云服务商）
- **Model Fetching** — 点击 🔄 一键从供应商 API 拉取实时模型列表
- **Per-Provider API Key** — 每个供应商独立存储 API key
- **Slash Commands `/`** — 输入 `/` 弹出命令菜单
- **Input History** — `↑`/`↓` 键浏览历史消息（最多 50 条）
- **Image Paste & Upload** — 粘贴图片或点击按钮本地上传
- **Semantic Search** — BM25 代码搜索引擎
- **Project Rules** — `.bytepilotrules` 自动注入 AI system prompt
- **Auto Config** — 首次启动自动读取 `.claude/settings.json`
- **Multi-Session** — JSONL 持久化，创建/切换/删除会话
- **Structured Logging** — 统一日志（桌面端支持文件日志 `%APPDATA%/BytePilot/logs/`）
- **Cross-Platform** — 70%+ 代码在 VS Code 和桌面端之间共享

## 快速开始

### VS Code 插件

1. 从 [Releases](https://github.com/hjy-2004/bytepilot-vscode/releases) 下载 `.vsix`
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX** → 选择文件
3. 点击左侧活动栏机器人图标 → 配置 Provider / API Key
4. 开始对话

### 桌面端

从 [Releases](https://github.com/hjy-2004/bytepilot-vscode/releases) 下载对应平台安装包，双击安装。

或从源码运行：

```bash
# 安装 Rust: https://rustup.rs
# 然后：
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode
npm install
npm run build:webview
cd packages/tauri-app && npm install && npm run dev
```

## 从源码构建

```bash
git clone https://github.com/hjy-2004/bytepilot-vscode.git
cd bytepilot-vscode

# VS Code 插件
npm install
npm run build            # 构建 core + extension + webview
npx vsce package         # 打包 .vsix

# Tauri 桌面端
npm run build:webview
cd packages/tauri-app && npm install && npm run build
```

用 VS Code 打开文件夹，**F5** 启动插件调试。

## 架构

```
extension_plugin/
├── packages/
│   ├── core/                      # @bytepilot/core — 共享核心（TS, tsc 编译）
│   │   ├── ai/                    # agent-loop, api-client, stream-bridge, ...
│   │   ├── tools/                 # registry, diff-file, definitions
│   │   ├── session/               # JSONL 持久化
│   │   ├── search/                # BM25 语义搜索
│   │   ├── config/                # 60+ 供应商预设
│   │   ├── types/                 # IPC, AI, providers, platform 接口
│   │   └── platform/              # ILogger, IFileSystem, IConfigStore, ...
│   │
│   └── tauri-app/                 # @bytepilot/tauri-app — Tauri 桌面端
│       ├── src/                   # TS 平台适配器 (IFileSystem, IConfigStore, ...)
│       ├── src-tauri/             # Rust 后端 (FS, Shell, Config, Logging 命令)
│       └── src-tauri/src/commands/  # fs.rs, config.rs, shell.rs, log.rs
│
├── src/                           # VS Code 插件（shim → @bytepilot/core）
│   ├── platform/                  # VS Code 适配器 (VSCodeFileSystem, VSCodeConfigStore, ...)
│   ├── ai/                        # chat-engine, completion-engine (通过 IConfigStore)
│   ├── tools/                     # 7 个平台相关工具实现
│   ├── chat/                      # panel.ts, router.ts
│   ├── completion/                # InlineCompletionItemProvider
│   └── extension.ts               # 入口
│
├── webview-ui/                    # 共享 React UI (Vite + Zustand)
│   ├── platform/                  # IPlatformAdapter (vscode / tauri)
│   ├── styles/                    # theme-vscode.css / theme-desktop.css
│   └── components/                # ChatContainer, DiffView, ModelSelector, ...
│
├── turbo.json                     # Turborepo 并行构建
├── esbuild.config.mjs             # 插件构建
└── .github/workflows/             # CI/CD (typecheck + lint + build + desktop)
```

## 技术栈

| 层 | 技术 |
|------|------|
| VS Code 插件 | TypeScript + VS Code API |
| Tauri 桌面 | Rust + Tauri v2 (14MB 二进制) |
| AI 引擎 | 多协议 HTTP 客户端 (Anthropic/OpenAI/Gemini/Ollama, SSE 流式) |
| Agent 循环 | 手动控制，AI 自主停止，500 步安全帽 |
| UI | React 18 + Zustand + react-markdown, CSS 语义令牌 |
| 构建 | Turborepo + esbuild (插件) + Vite (WebView) + Cargo (桌面) |
| CI/CD | GitHub Actions (typecheck, lint, 三平台桌面构建, VS Code Marketplace 发布) |

## 桌面端日志

桌面端日志写入 `%APPDATA%\BytePilot\logs\bytepilot.log`，超过 1MB 自动轮转。

或在 Tauri 窗口按 **F12** 打开 DevTools → Console 查看实时日志。

## 设置项

| 设置 | 默认 | 说明 |
|------|------|------|
| `aiCodingAgent.provider` | `anthropic` | 厂商 |
| `aiCodingAgent.chatModel` | `claude-sonnet-4-6` | 对话模型 |
| `aiCodingAgent.completionModel` | (空) | 补全模型 |
| `aiCodingAgent.baseURL` | (空) | 自定义 API 地址 |
| `aiCodingAgent.temperature` | `0.7` | 创造性 |
| `aiCodingAgent.maxTokens` | `4096` | 响应上限 |
| `aiCodingAgent.thinkingBudget` | `4096` | 扩展思考预算（0=关闭） |
| `aiCodingAgent.maxAgentSteps` | `500` | Agent 循环安全上限 |
| `aiCodingAgent.toolApprovalLevel` | `writeOnly` | 审批级别 |
| `aiCodingAgent.completionsEnabled` | `true` | 启用补全 |

## License

MIT
