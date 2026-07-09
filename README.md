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
- **Multi-Turn Tool Calling** — AI 自主调用文件读写、搜索、Shell 等工具，支持多轮交互
- **Inline Completion** — 输入停顿自动触发灰色补全，Tab 接受
- **Visual Diff & Approval** — 文件编辑前显示可视化 diff，内联审批（Approve/Reject）
- **File Editing** — 精准 `old_string → new_string` 替换（Claude Code 风格）
- **Tool System** — 8 个内置工具：read / write / edit / search / list / command / diagnostics / diff
- **Multi-Provider** — 60+ 供应商预设，支持 Anthropic / OpenAI / DeepSeek / Google Gemini / Azure OpenAI / Ollama / Kimi / 智谱 / MiniMax / 阶跃星辰 / 火山方舟 / OpenRouter / SiliconFlow 等
- **Provider Categories** — 供应商按 5 大分类展示（官方 / 国产官方 / 聚合商 / 第三方 / 云服务商）
- **Model Fetching** — 点击 🔄 一键从供应商 API 拉取实时模型列表
- **Config Import** — 首次启动自动扫描 Claude Code、Cursor 等已知配置文件，一键导入 Provider / Model / API Key
- **Per-Provider API Key** — 每个供应商独立存储 API key，写入 `~/.bytepilot/settings.json`，方便手动编辑和跨工具共享
- **Shared Config** — 插件和桌面端共享 `~/.bytepilot/settings.json`，一端配置另一端自动沿用
- **Unified Session Storage** — 插件和桌面端共享 `~/.bytepilot/projects/` 目录，JSONL 格式，跨平台互通
- **Human-Readable Project Dirs** — 路径映射为可读目录名（`D:\my-project` → `D--my-project`）
- **Multi-Session** — 创建/切换/删除会话，UUID 格式会话 ID，消息数量显示
- **Session Restore** — 恢复历史会话时完整还原工具调用卡片（含结果和状态）
- **Auto-Memory** — 按 git 仓库隔离的自动记忆系统，支持 user/feedback/project/reference 四种类型
- **Per-Session Summary** — 每个会话独立 summary.md，追踪任务状态和关键结果
- **BYTEPILOT.md** — 项目级指令文件，支持多层级加载（项目/本地/全局）
- **Empty by Default** — 首次启动不预设供应商/模型，用户自行选择后才会写入配置文件
- **Slash Commands `/`** — 输入 `/` 弹出命令菜单
- **Input History** — `↑`/`↓` 键浏览历史消息（最多 50 条）
- **Image Paste & Upload** — 粘贴图片或点击按钮本地上传
- **Semantic Search** — BM25 关键词搜索（非语义/Embedding 搜索）
- **CJK Token Counting** — 中/日/韩文字符感知的 token 估算（~1.5 chars/token vs ASCII ~4）
- **Project Rules** — `.bytepilotrules` / `BYTEPILOT.md` 自动注入 AI system prompt
- **Auto Config** — 首次启动自动创建 `~/.bytepilot/settings.json` 空占位文件，可从 `.claude/settings.json` 一键导入配置
- **Theme Customization** — 桌面端支持自定义主题配色，预设浅色/深色模式，可调整 50+ 颜色变量
- **Structured Logging** — 统一日志（桌面端支持文件日志 `%APPDATA%/BytePilot/logs/`）
- **Auto-Update (Desktop)** — 桌面端启动时自动检测 GitHub Releases 更新，提示用户升级
- **Cross-Platform** — 70%+ 代码在 VS Code 和桌面端之间共享
- **Security** — 工作区路径边界检查（canonicalize 防 `..` 穿越，双平台统一）、双平台危险命令拦截、Shell 超时杀进程、配置导入的 apiKeyHelper 需显式确认后才执行

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
npm run build:webview:desktop
cd packages/tauri-app && npm install && npm run dev:tauri
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
npm run build:webview:desktop
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
│   │   ├── session/               # JSONL 持久化 + session-memory
│   │   ├── memory/                # 自动记忆系统（memdir, CRUD）
│   │   ├── search/                # BM25 语义搜索
│   │   ├── config/                # 60+ 供应商预设 + 配置导入解析 + bytepilot-md 加载器
│   │   ├── types/                 # IPC, AI, providers, platform 接口
│   │   ├── utils/                 # token-counter, diff-helper, paths (sanitizePath)
│   │   └── platform/              # ILogger, IFileSystem, IConfigStore, ...
│   │
│   └── tauri-app/                 # @bytepilot/tauri-app — Tauri 桌面端
│       ├── src/                   # TS 平台适配器 (IFileSystem, IConfigStore, ...)
│       ├── src-tauri/             # Rust 后端
│       └── src-tauri/src/commands/  # chat.rs, config.rs, fs.rs, shell.rs, log.rs, workspace.rs
│
├── src/                           # VS Code 插件（shim → @bytepilot/core）
│   ├── platform/                  # VS Code 适配器 (VSCodeFileSystem, VSCodeConfigStore, ...)
│   ├── ai/                        # chat-engine, completion-engine (通过 IConfigStore)
│   ├── tools/                     # 7 个平台相关工具实现
│   ├── chat/                      # panel.ts, router.ts
│   ├── completion/                # InlineCompletionItemProvider
│   ├── context/                   # ContextCollector, BYTEPILOT.md / .bytepilotrules 加载
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
| Session 存储 | JSONL + sanitizePath 可读目录 + UUID 会话 ID |
| 自动记忆 | YAML frontmatter .md 文件，按 git 仓库隔离 |
| UI | React 18 + Zustand + react-markdown, CSS 语义令牌 |
| 构建 | Turborepo + esbuild (插件) + Vite (WebView) + Cargo (桌面) |
| CI/CD | GitHub Actions (typecheck, lint, 三平台桌面构建, VS Code Marketplace 发布) |

## 存储目录结构

```
~/.bytepilot/
├── settings.json                  # 全局配置（插件/桌面端共享）
├── BYTEPILOT.md                   # 用户全局指令（可选）
├── projects/
│   └── <sanitized-path>/          # 每个项目一个目录
│       ├── <uuid>.jsonl           # 会话记录（JSONL 格式）
│       ├── <session-id>/          # 会话专属目录
│       │   └── session-memory/
│       │       └── summary.md     # 会话摘要
│       └── memory/                # 自动记忆（按 git root 隔离）
│           ├── MEMORY.md          # 记忆索引
│           ├── user_role.md       # 用户角色记忆
│           └── project_xxx.md     # 项目相关记忆
```

## 主题设置（桌面端）

桌面端支持自定义主题配色，点击侧边栏齿轮图标进入设置页面：

- **预设模式**：浅色 / 深色两种预设，一键切换
- **自定义配色**：9 个分类共 50+ 颜色变量，使用取色器自由调整
- **实时预览**：修改即时生效，无需重启
- **重置恢复**：一键恢复默认配色
- **持久化**：配色方案保存在浏览器 localStorage 中

## 桌面端日志

桌面端日志写入 `%APPDATA%\BytePilot\logs\bytepilot.log`，超过 1MB 自动轮转。

或在 Tauri 窗口按 **F12** 打开 DevTools → Console 查看实时日志。

## 配置文件

插件和桌面端共享 `~/.bytepilot/settings.json`，**首次启动自动创建空占位文件**，内容由用户配置后填充：

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

`env` 块与 `.claude/settings.json` 格式兼容，支持 CLI 工具直接读取。

## 设置项

| 设置 | 默认 | 说明 |
|------|------|------|
| `aiCodingAgent.provider` | (空) | 厂商，需手动选择 |
| `aiCodingAgent.chatModel` | (空) | 对话模型 |
| `aiCodingAgent.completionModel` | (空) | 补全模型 |
| `aiCodingAgent.baseURL` | (空) | 自定义 API 地址 |
| `aiCodingAgent.temperature` | `0.7` | 创造性 |
| `aiCodingAgent.maxTokens` | `4096` | 响应上限 |
| `aiCodingAgent.thinkingBudget` | `4096` | 扩展思考预算（0=关闭） |
| `aiCodingAgent.maxAgentSteps` | `500` | Agent 循环安全上限 |
| `aiCodingAgent.toolApprovalLevel` | `writeOnly` | 审批级别 |
| `aiCodingAgent.completionsEnabled` | `true` | 启用补全 |
| `aiCodingAgent.contextLength` | `128000` | 上下文长度（tokens） |

## 项目指令文件 (BYTEPILOT.md)

BytePilot 支持从多个来源加载项目指令，按优先级合并（后面覆盖前面）：

1. `BYTEPILOT.md` — 项目根目录（签入 git，团队共享）
2. `BYTEPILOT.local.md` — 项目根目录（gitignore，个人私密）
3. `.bytepilotrules` — 旧版兼容格式

也可以在用户目录放置全局指令：`~/.bytepilot/BYTEPILOT.md`

## 测试

```bash
# 一键运行 core 全部测试（编译后运行 token 计数 / API 消息转换 / 配置验证）
npm test -w @bytepilot/core

# 或通过 Turborepo 运行（CI 使用同一命令）
npx turbo run test
```

## License

MIT
