# BytePilot v0.3.1 Release Notes

---

## English

### ✨ New Features

- **Extended Thinking** — Anthropic's extended thinking is now enabled by default with a 4096-token budget. The model will reason deeply before responding, significantly improving code quality on complex tasks. Set `aiCodingAgent.thinkingBudget` to `0` to disable, or increase for harder problems.
- **Prompt Caching** — System prompt and tool definitions are now cached with `cache_control: ephemeral`, reducing token costs by up to 90% on repeated requests.
- **API Retry with Backoff** — Transient errors (429 rate limit, 502/503/504 server errors) are now automatically retried up to 3 times with exponential backoff.
- **Token Counting & Context Trimming** — Built-in token estimator automatically trims workspace context to fit within the model's context window, preventing silent truncation.
- **Colored Logging** — The BytePilot output channel now uses VS Code's native log color system: blue for info, yellow for warnings, red for errors, gray for debug. Timestamps are now compact `HH:MM:SS.mmm` format.
- **Real-time UX Progress Indicators** — The chat UI now shows immediate feedback:
  - "Thinking..." animated dots appear the moment you send a message (no more blank waiting)
  - Tool cards display real-time elapsed counters ("Running... 12s")
  - Animated progress bars on executing tools
  - Per-tool "Executing..." dots when expanded
  - Smart status text: "Waiting for your approval..." / "Running: Edit File..." / "Running 3 tools..."
  - `chat.started` backend event confirms processing has begun

### 🐛 Bug Fixes

- **Completion routing** — Anthropic provider no longer hits a non-existent FIM endpoint; correctly uses chat-based fill-in-middle.
- **`isGenerating` stuck** — Chat engine's generating flag is now reset in a `finally` block, preventing permanent lock-up after errors or cancellations.
- **Debouncer cross-file interference** — Completion debounce state is now per-document, fixing false delays when switching between editor tabs.
- **DeepSeek URL double `/beta`** — Fixed chained `replace()` causing `.../beta/beta/completions` on certain baseURL configurations.
- **Missing AI logs** — `ai-logger.ts` now shares the same `OutputChannel` as `logger.ts`; AI interaction logs are no longer silently lost.
- **Command security** — Dangerous command detector expanded from 4 to 12 patterns (fork bombs, `curl|sh`, `chmod 777 /`, `mkfs`, `dd` to `/dev/`, base64 obfuscation).
- **`search_files` crash** — Added 256KB per-file size limit to prevent out-of-memory on large/malformed files.
- **`read_diagnostics` fix** — `filePath` parameter now correctly searches ALL diagnostics instead of only open tabs.
- **`execSync` → async** — Git diff via `diff_file` tool now uses async `exec()` to avoid blocking the VS Code extension host.
- **API key logging** — Removed API key prefix from `showConfig` debug output.

### ⚙️ New Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiCodingAgent.thinkingBudget` | `4096` | Extended thinking token budget (0 = disabled) |

### 📦 Install

Download `bytepilot-0.3.1.vsix`, then in VS Code:
`Ctrl+Shift+P` → **Extensions: Install from VSIX** → select the file.

Or update from GitHub Releases.

---

## 中文

### ✨ 新增功能

- **Extended Thinking（深度推理）** — Anthropic 扩展推理功能默认启用（4096 token 预算）。模型会在回复前进行深度思考，显著提升复杂编码任务的质量。设置 `aiCodingAgent.thinkingBudget` 为 `0` 可关闭，或增大以应对更复杂问题。
- **Prompt Caching（提示词缓存）** — System prompt 和工具定义现在带有 `cache_control: ephemeral`，重复请求可节省最高 90% 的 token 费用。
- **API 自动重试** — 遇到 429（限流）、502/503/504（服务端错误）等临时错误时，自动指数退避重试最多 3 次。
- **Token 计数与上下文裁剪** — 内置 token 估算器，自动将工作区上下文裁剪到模型窗口限制内，防止静默截断。
- **彩色日志输出** — BytePilot 输出频道使用 VS Code 原生日志颜色：蓝色=信息，黄色=警告，红色=错误，灰色=调试。时间戳改为紧凑的 `HH:MM:SS.mmm` 格式。
- **实时 UX 进度指示器** — 聊天界面现在提供即时反馈：
  - 点击发送后**立即显示** "Thinking..." 动画圆点（不再长时间空白等待）
  - 工具卡片显示**实时耗时统计**（"Running... 12s"）
  - 工具执行时有**动画进度条**
  - 展开工具卡片时显示 "Executing..." **跳动圆点**
  - 智能状态提示："Waiting for your approval..." / "Running: Edit File..." / "Running 3 tools..."
  - 后端 `chat.started` 事件确认处理已开始

### 🐛 Bug 修复

- **补全路由错误** — Anthropic  provider 不再错误调用不存在的 DeepSeek FIM 端点，改用正确的 chat-based 补全。
- **`isGenerating` 标记卡死** — Chat Engine 的生成状态标记现在用 `finally` 块重置，修复异常或取消后的永久锁定问题。
- **Debouncer 跨文件干扰** — 补全防抖状态现在按文档 URI 独立追踪，修复切换标签页后的错误延迟。
- **DeepSeek URL 双 `/beta`** — 修复链式 `replace()` 在某些 baseURL 下产生的 `.../beta/beta/completions` 路径错误。
- **AI 日志丢失** — `ai-logger.ts` 现在与 `logger.ts` 共用同一个 OutputChannel，AI 交互日志不再丢失。
- **命令执行安全加固** — 危险命令检测从 4 个模式扩展到 12 个（fork 炸弹、`curl|sh`、`chmod 777 /`、`mkfs`、dd 写盘、base64 混淆等）。
- **`search_files` 崩溃** — 添加 256KB 单文件大小限制，防止大文件导致内存溢出。
- **`read_diagnostics` 修复** — `filePath` 参数现在正确搜索所有诊断，而非仅限打开的文件。
- **`execSync` 改异步** — `diff_file` 工具的 git diff 现在使用异步 `exec()`，不再阻塞 VS Code 扩展宿主。
- **API Key 日志泄露** — 从 `showConfig` 调试输出中移除 API Key 前缀。

### ⚙️ 新增设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `aiCodingAgent.thinkingBudget` | `4096` | Extended thinking token 预算（0=关闭） |

### 📦 安装方式

下载 `bytepilot-0.3.1.vsix`，在 VS Code 中：
`Ctrl+Shift+P` → **Extensions: Install from VSIX** → 选择文件。

或从 GitHub Releases 页面更新。
