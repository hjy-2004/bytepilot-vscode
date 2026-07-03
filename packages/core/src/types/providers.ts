/**
 * Provider Knowledge Base — sourced from cc-switch's provider preset catalog.
 *
 * This is the single source of truth for provider metadata: base URLs, API formats,
 * default models, known model catalogs, icon mappings, and URL-compat-suffix handling.
 *
 * References:
 *   cc-switch/src/config/claudeProviderPresets.ts     (63 Claude-compatible providers)
 *   cc-switch/src/config/opencodeProviderPresets.ts    (model variant catalog)
 *   cc-switch/src-tauri/src/provider_defaults.rs       (icon + color defaults)
 *   cc-switch/src-tauri/src/services/model_fetch.rs    (known compat suffixes)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProviderCategory =
  | 'official'
  | 'cn_official'
  | 'cloud_provider'
  | 'aggregator'
  | 'third_party';

/** API protocol a provider uses for chat. */
export type ApiFormat =
  | 'anthropic'         // Native Anthropic Messages API (x-api-key auth)
  | 'openai_chat'       // OpenAI Chat Completions API (Bearer auth)
  | 'google'            // Google Gemini SDK (API key via @ai-sdk/google)
  | 'openai_compat';    // OpenAI-compatible endpoint (used by DeepSeek, Ollama, etc.)

/** A single model entry */
export interface ModelInfo {
  id: string;
  name: string;
}

/** Extended model info with limits (for catalog display) */
export interface ModelVariant extends ModelInfo {
  contextLimit?: number;
  outputLimit?: number;
  modalities?: { input: string[]; output: string[] };
}

/** Provider icon mapping (from cc-switch provider_defaults.rs) */
export interface ProviderIcon {
  name: string;   // icon identifier
  color: string;  // hex color (e.g. "#D4915D")
}

/** A full provider preset — everything needed to configure one provider */
export interface ProviderPreset {
  /** Unique identifier (kebab-case, ASCII) */
  id: string;
  /** Display name */
  name: string;
  /** Category for grouping in UI */
  category: ProviderCategory;
  /** API format used by this provider */
  apiFormat: ApiFormat;
  /** Default base URL (may be empty for official providers that use SDK defaults) */
  baseURL: string;
  /** Default chat model */
  defaultChatModel: string;
  /** Default completion model */
  defaultCompletionModel: string;
  /** Known models for UI display */
  models: ModelInfo[];
  /** Icon name */
  icon: string;
  /** Icon color (hex) */
  iconColor: string;
  /** Whether this provider requires OAuth instead of API key */
  requiresOAuth?: boolean;
  /** Additional endpoint candidates */
  endpointCandidates?: string[];
  /** Partner / promoted provider */
  isPartner?: boolean;
}

/** Known URL suffixes to strip when building model-list endpoints.
 *  From cc-switch's model_fetch.rs:41-53 */
export interface CompatSuffix {
  suffix: string;
  description: string; // which provider type uses it
}

// ── Known Compat Suffixes (for model-fetch URL construction) ────────────────────
// Source: cc-switch/src-tauri/src/services/model_fetch.rs lines 39-49
export const KNOWN_COMPAT_SUFFIXES: CompatSuffix[] = [
  { suffix: '/api/claudecode', description: 'AICodeMirror-style proxies' },
  { suffix: '/api/anthropic', description: 'Zhipu, Novita, DeepSeek-compat' },
  { suffix: '/apps/anthropic', description: 'Bailian, DashScope Anthropic compat' },
  { suffix: '/api/coding', description: 'Volcano/DouBao Coding Plan' },
  { suffix: '/claudecode', description: 'AICodeMirror / general compat' },
  { suffix: '/anthropic', description: 'DeepSeek, MiniMax, Kimi, Xiaomi MiMo, Longcat' },
  { suffix: '/step_plan', description: 'StepFun Step Plan' },
  { suffix: '/coding', description: 'Kimi For Coding, Baidu Qianfan, Volcano' },
  { suffix: '/claude', description: 'RightCode' },
];

// ── Provider Icons (from cc-switch provider_defaults.rs) ────────────────────────

export const PROVIDER_ICONS: Record<string, ProviderIcon> = {
  openai:       { name: 'openai',    color: '#00A67E' },
  anthropic:    { name: 'anthropic', color: '#D4915D' },
  claude:       { name: 'claude',    color: '#D4915D' },
  google:       { name: 'google',    color: '#4285F4' },
  gemini:       { name: 'gemini',    color: '#4285F4' },
  deepseek:     { name: 'deepseek',  color: '#1E88E5' },
  kimi:         { name: 'kimi',      color: '#6366F1' },
  moonshot:     { name: 'moonshot',  color: '#6366F1' },
  zhipu:        { name: 'zhipu',     color: '#0F62FE' },
  minimax:      { name: 'minimax',   color: '#FF6B6B' },
  baidu:        { name: 'baidu',     color: '#2932E1' },
  alibaba:      { name: 'alibaba',   color: '#FF6A00' },
  tencent:      { name: 'tencent',   color: '#00A4FF' },
  meta:         { name: 'meta',      color: '#0081FB' },
  microsoft:    { name: 'microsoft', color: '#00A4EF' },
  cohere:       { name: 'cohere',    color: '#39594D' },
  perplexity:   { name: 'perplexity',color: '#20808D' },
  mistral:      { name: 'mistral',   color: '#FF7000' },
  huggingface:  { name: 'huggingface', color: '#FFD21E' },
  aws:          { name: 'aws',       color: '#FF9900' },
  azure:        { name: 'azure',     color: '#0078D4' },
  huawei:       { name: 'huawei',    color: '#FF0000' },
  cloudflare:   { name: 'cloudflare',color: '#F38020' },
  nvidia:       { name: 'nvidia',    color: '#76B900' },
  xiaomi:       { name: 'xiaomi',    color: '#FF6900' },
  stepfun:      { name: 'stepfun',   color: '#16D6D2' },
  longcat:      { name: 'longcat',   color: '#29E154' },
  openrouter:   { name: 'openrouter',color: '#6566F1' },
  siliconflow:  { name: 'siliconflow', color: '#6E29F6' },
  github:       { name: 'github',    color: '#24292F' },
  ollama:       { name: 'ollama',    color: '#000000' },
};

// ── Model Catalog (from cc-switch OPENCODE_PRESET_MODEL_VARIANTS) ──────────────

export const MODEL_CATALOG: Record<string, ModelVariant[]> = {
  // Claude models (Anthropic)
  claude: [
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', contextLimit: 1_000_000, outputLimit: 128_000, modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextLimit: 1_000_000, outputLimit: 64_000, modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextLimit: 200_000, outputLimit: 64_000, modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextLimit: 200_000, outputLimit: 64_000, modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', contextLimit: 200_000, outputLimit: 64_000, modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
  ],
  // OpenAI models
  openai: [
    { id: 'gpt-5.5', name: 'GPT-5.5', contextLimit: 400_000, outputLimit: 128_000, modalities: { input: ['text', 'image'], output: ['text'] } },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextLimit: 200_000, outputLimit: 128_000 },
    { id: 'gpt-5', name: 'GPT-5', contextLimit: 250_000, outputLimit: 128_000 },
    { id: 'gpt-5.2', name: 'GPT-5.2', contextLimit: 200_000, outputLimit: 64_000 },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextLimit: 200_000, outputLimit: 64_000 },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', contextLimit: 200_000, outputLimit: 64_000 },
    { id: 'gpt-4o', name: 'GPT-4o', contextLimit: 128_000, outputLimit: 16_384, modalities: { input: ['text', 'image'], output: ['text'] } },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLimit: 128_000, outputLimit: 16_384 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextLimit: 128_000, outputLimit: 4096 },
    { id: 'o3-mini', name: 'o3 Mini', contextLimit: 200_000, outputLimit: 100_000 },
  ],
  // Google Gemini models
  gemini: [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', contextLimit: 1_048_576, outputLimit: 65_536, modalities: { input: ['text', 'image', 'pdf', 'video', 'audio'], output: ['text'] } },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextLimit: 1_048_576, outputLimit: 65_536, modalities: { input: ['text', 'image', 'pdf', 'video', 'audio'], output: ['text'] } },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLimit: 1_048_576, outputLimit: 65_536, modalities: { input: ['text', 'image', 'pdf', 'video', 'audio'], output: ['text'] } },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', contextLimit: 1_048_576, outputLimit: 65_536, modalities: { input: ['text', 'image', 'pdf', 'video', 'audio'], output: ['text'] } },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextLimit: 1_048_576, outputLimit: 8_192 },
  ],
  // DeepSeek models
  deepseek: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextLimit: 1_000_000, outputLimit: 32_000 },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextLimit: 1_000_000, outputLimit: 32_000 },
  ],
  // Kimi / Moonshot models
  kimi: [
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextLimit: 262_144, outputLimit: 262_144 },
    { id: 'kimi-k2.6', name: 'Kimi K2.6', contextLimit: 262_144, outputLimit: 262_144, modalities: { input: ['text', 'image', 'video'], output: ['text'] } },
    { id: 'kimi-k2.5', name: 'Kimi K2.5', contextLimit: 131_072, outputLimit: 131_072 },
  ],
  // Zhipu GLM models
  zhipu: [
    { id: 'glm-5.1', name: 'GLM 5.1', contextLimit: 204_800, outputLimit: 131_072 },
    { id: 'glm-5.2', name: 'GLM 5.2', contextLimit: 204_800, outputLimit: 131_072 },
  ],
  // MiniMax models
  minimax: [
    { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', contextLimit: 204_800, outputLimit: 131_072 },
  ],
  // StepFun models
  stepfun: [
    { id: 'step-3.5-flash-2603', name: 'Step 3.5 Flash 2603', contextLimit: 262_144 },
    { id: 'step-3.5-flash', name: 'Step 3.5 Flash', contextLimit: 262_144 },
  ],
  // ByteDance / Volcano models
  volcano: [
    { id: 'ark-code-latest', name: 'Ark Code Latest', contextLimit: 1_000_000, outputLimit: 128_000 },
    { id: 'doubao-seed-2-1-pro', name: 'DouBao Seed 2.1 Pro', contextLimit: 1_000_000, outputLimit: 128_000 },
  ],
  // Xiaomi MiMo models
  mimo: [
    { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', contextLimit: 1_048_576, outputLimit: 131_072 },
    { id: 'mimo-v2.5', name: 'MiMo V2.5', contextLimit: 1_048_576, outputLimit: 131_072, modalities: { input: ['text', 'image'], output: ['text'] } },
  ],
  // Amazon Bedrock models
  bedrock: [
    { id: 'global.anthropic.claude-opus-4-8', name: 'Claude Opus 4.8', contextLimit: 1_000_000, outputLimit: 128_000 },
    { id: 'global.anthropic.claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextLimit: 1_000_000, outputLimit: 64_000 },
    { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5', contextLimit: 200_000, outputLimit: 64_000 },
    { id: 'us.amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', contextLimit: 300_000, outputLimit: 5_000, modalities: { input: ['text', 'image'], output: ['text'] } },
    { id: 'us.meta.llama4-maverick-17b-instruct-v1:0', name: 'Meta Llama 4 Maverick', contextLimit: 131_072, outputLimit: 131_072 },
    { id: 'us.deepseek.r1-v1:0', name: 'DeepSeek R1', contextLimit: 131_072, outputLimit: 131_072 },
  ],
  // Other models referenced by aggregators
  other: [
    { id: 'LongCat-Flash-Chat', name: 'LongCat Flash Chat', contextLimit: 200_000 },
    { id: 'Ling-2.5-1T', name: 'Ling 2.5-1T', contextLimit: 200_000 },
    { id: 'KAT-Coder-Pro V1', name: 'KAT-Coder Pro V1', contextLimit: 200_000 },
    { id: 'KAT-Coder-Air V1', name: 'KAT-Coder Air V1', contextLimit: 200_000 },
    { id: 'qianfan-code-latest', name: 'Qianfan Code Latest', contextLimit: 200_000 },
    { id: 'codellama', name: 'CodeLlama' },
    { id: 'llama3', name: 'Llama 3' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    { id: 'qwen3.7-max', name: 'Qwen 3.7 Max' },
    { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2' },
  ],
};

// ── Provider Preset Definitions ─────────────────────────────────────────────────

/**
 * All known provider presets.
 *
 * Each entry includes a base URL (for the OpenAI-compatible or Anthropic-compatible
 * endpoint), default chat/completion models, and a list of known models for the UI.
 * Categories follow cc-switch's classification.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // OFFICIAL PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    category: 'official',
    apiFormat: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-haiku-4-5-20251001',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    category: 'official',
    apiFormat: 'openai_chat',
    baseURL: 'https://api.openai.com/v1',
    defaultChatModel: 'gpt-4o',
    defaultCompletionModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o3-mini', name: 'o3 Mini' },
    ],
    icon: 'openai',
    iconColor: '#00A67E',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    category: 'official',
    apiFormat: 'google',
    baseURL: 'https://generativelanguage.googleapis.com',
    defaultChatModel: 'gemini-2.5-pro',
    defaultCompletionModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    ],
    icon: 'gemini',
    iconColor: '#4285F4',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.deepseek.com/v1',
    defaultChatModel: 'deepseek-v4-pro',
    defaultCompletionModel: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    ],
    icon: 'deepseek',
    iconColor: '#1E88E5',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    category: 'official',
    apiFormat: 'openai_compat',
    baseURL: 'http://localhost:11434/v1',
    defaultChatModel: 'codellama',
    defaultCompletionModel: 'codellama',
    models: [
      { id: 'codellama', name: 'CodeLlama' },
      { id: 'llama3', name: 'Llama 3' },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    ],
    icon: 'ollama',
    iconColor: '#000000',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    category: 'official',
    apiFormat: 'openai_chat',
    baseURL: '', // User must provide resource-specific URL
    defaultChatModel: 'gpt-4o',
    defaultCompletionModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ],
    icon: 'azure',
    iconColor: '#0078D4',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CN OFFICIAL PROVIDERS (Chinese AI labs)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultChatModel: 'kimi-k2.7-code',
    defaultCompletionModel: 'kimi-k2.7-code',
    models: [
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code' },
      { id: 'kimi-k2.6', name: 'Kimi K2.6' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
    ],
    icon: 'kimi',
    iconColor: '#6366F1',
    isPartner: true,
  },
  {
    id: 'kimi-for-coding',
    name: 'Kimi For Coding',
    category: 'cn_official',
    apiFormat: 'anthropic',
    baseURL: 'https://api.kimi.com/coding',
    defaultChatModel: 'kimi-for-coding',
    defaultCompletionModel: 'kimi-for-coding',
    models: [
      { id: 'kimi-for-coding', name: 'Kimi For Coding' },
    ],
    icon: 'kimi',
    iconColor: '#6366F1',
    isPartner: true,
  },
  {
    id: 'zhipu-glm',
    name: 'Zhipu GLM',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
    defaultChatModel: 'glm-5.1',
    defaultCompletionModel: 'glm-5.1',
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1' },
    ],
    icon: 'zhipu',
    iconColor: '#0F62FE',
  },
  {
    id: 'zhipu-glm-en',
    name: 'Zhipu GLM (Global)',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.z.ai/api/coding/paas/v4',
    defaultChatModel: 'glm-5.1',
    defaultCompletionModel: 'glm-5.1',
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1' },
    ],
    icon: 'zhipu',
    iconColor: '#0F62FE',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.minimaxi.com/v1',
    defaultChatModel: 'MiniMax-M2.7',
    defaultCompletionModel: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
    ],
    icon: 'minimax',
    iconColor: '#FF6B6B',
  },
  {
    id: 'minimax-en',
    name: 'MiniMax (Global)',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.minimax.io/v1',
    defaultChatModel: 'MiniMax-M2.7',
    defaultCompletionModel: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
    ],
    icon: 'minimax',
    iconColor: '#FF6B6B',
  },
  {
    id: 'stepfun',
    name: 'StepFun',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.stepfun.com/step_plan/v1',
    defaultChatModel: 'step-3.5-flash-2603',
    defaultCompletionModel: 'step-3.5-flash',
    models: [
      { id: 'step-3.5-flash-2603', name: 'Step 3.5 Flash 2603' },
      { id: 'step-3.5-flash', name: 'Step 3.5 Flash' },
    ],
    icon: 'stepfun',
    iconColor: '#16D6D2',
  },
  {
    id: 'stepfun-en',
    name: 'StepFun (Global)',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.stepfun.ai/step_plan/v1',
    defaultChatModel: 'step-3.5-flash-2603',
    defaultCompletionModel: 'step-3.5-flash',
    models: [
      { id: 'step-3.5-flash-2603', name: 'Step 3.5 Flash 2603' },
      { id: 'step-3.5-flash', name: 'Step 3.5 Flash' },
    ],
    icon: 'stepfun',
    iconColor: '#16D6D2',
  },
  {
    id: 'bailian',
    name: 'Bailian (Alibaba)',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultChatModel: 'qwen3.7-max',
    defaultCompletionModel: 'qwen2.5-coder',
    models: [
      { id: 'qwen3.7-max', name: 'Qwen 3.7 Max' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    ],
    icon: 'alibaba',
    iconColor: '#FF6A00',
  },
  {
    id: 'baidu-qianfan',
    name: 'Baidu Qianfan Coding Plan',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://qianfan.baidubce.com/anthropic/coding',
    defaultChatModel: 'qianfan-code-latest',
    defaultCompletionModel: 'qianfan-code-latest',
    models: [
      { id: 'qianfan-code-latest', name: 'Qianfan Code Latest' },
    ],
    icon: 'baidu',
    iconColor: '#2932E1',
  },
  {
    id: 'volcano-agentplan',
    name: 'Volcano AgentPlan',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    defaultChatModel: 'ark-code-latest',
    defaultCompletionModel: 'ark-code-latest',
    models: [
      { id: 'ark-code-latest', name: 'Ark Code Latest' },
    ],
    icon: 'huawei',
    iconColor: '#3370FF',
    isPartner: true,
  },
  {
    id: 'doubaoseed',
    name: 'DouBao Seed',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultChatModel: 'doubao-seed-2-1-pro',
    defaultCompletionModel: 'doubao-seed-2-1-pro',
    models: [
      { id: 'doubao-seed-2-1-pro', name: 'DouBao Seed 2.1 Pro' },
    ],
    icon: 'xiaomi',
    iconColor: '#3370FF',
    isPartner: true,
  },
  {
    id: 'byteplus',
    name: 'BytePlus ModelArk',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://ark.ap-southeast.bytepluses.com/api/coding/v3',
    defaultChatModel: 'ark-code-latest',
    defaultCompletionModel: 'ark-code-latest',
    models: [
      { id: 'ark-code-latest', name: 'Ark Code Latest' },
    ],
    icon: 'xiaomi',
    iconColor: '#3370FF',
    isPartner: true,
  },
  {
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.xiaomimimo.com/v1',
    defaultChatModel: 'mimo-v2.5-pro',
    defaultCompletionModel: 'mimo-v2.5-pro',
    models: [
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro' },
      { id: 'mimo-v2.5', name: 'MiMo V2.5' },
    ],
    icon: 'xiaomi',
    iconColor: '#FF6900',
  },
  {
    id: 'xiaomi-mimo-token-plan',
    name: 'Xiaomi MiMo Token Plan',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://token-plan-cn.xiaomimimo.com/v1',
    defaultChatModel: 'mimo-v2.5-pro',
    defaultCompletionModel: 'mimo-v2.5-pro',
    models: [
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro' },
    ],
    icon: 'xiaomi',
    iconColor: '#FF6900',
  },
  {
    id: 'longcat',
    name: 'Longcat',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.longcat.chat/v1',
    defaultChatModel: 'LongCat-Flash-Chat',
    defaultCompletionModel: 'LongCat-Flash-Chat',
    models: [
      { id: 'LongCat-Flash-Chat', name: 'LongCat Flash Chat' },
    ],
    icon: 'longcat',
    iconColor: '#29E154',
  },
  {
    id: 'bailing',
    name: 'BaiLing (Ant)',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.tbox.cn/v1',
    defaultChatModel: 'Ling-2.5-1T',
    defaultCompletionModel: 'Ling-2.5-1T',
    models: [
      { id: 'Ling-2.5-1T', name: 'Ling 2.5-1T' },
    ],
    icon: 'alibaba',
    iconColor: '#FF6A00',
  },
  {
    id: 'kat-coder',
    name: 'KAT-Coder',
    category: 'cn_official',
    apiFormat: 'openai_compat',
    baseURL: '', // Requires ENDPOINT_ID template
    defaultChatModel: 'KAT-Coder-Pro V1',
    defaultCompletionModel: 'KAT-Coder-Air V1',
    models: [
      { id: 'KAT-Coder-Pro V1', name: 'KAT-Coder Pro V1' },
      { id: 'KAT-Coder-Air V1', name: 'KAT-Coder Air V1' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // AGGREGATORS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultChatModel: 'anthropic/claude-sonnet-4.6',
    defaultCompletionModel: 'anthropic/claude-haiku-4.5',
    models: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8' },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    ],
    icon: 'openrouter',
    iconColor: '#6566F1',
  },
  {
    id: 'therouter',
    name: 'TheRouter',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.therouter.ai/v1',
    defaultChatModel: 'anthropic/claude-sonnet-4.6',
    defaultCompletionModel: 'anthropic/claude-haiku-4.5',
    models: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex' },
      { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    ],
    icon: 'openrouter',
    iconColor: '#6566F1',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultChatModel: 'Pro/MiniMaxAI/MiniMax-M2.7',
    defaultCompletionModel: 'Pro/MiniMaxAI/MiniMax-M2.7',
    models: [
      { id: 'Pro/MiniMaxAI/MiniMax-M2.7', name: 'MiniMax M2.7' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
    ],
    icon: 'siliconflow',
    iconColor: '#6E29F6',
    isPartner: true,
  },
  {
    id: 'siliconflow-en',
    name: 'SiliconFlow (Global)',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.siliconflow.com/v1',
    defaultChatModel: 'MiniMaxAI/MiniMax-M2.7',
    defaultCompletionModel: 'MiniMaxAI/MiniMax-M2.7',
    models: [
      { id: 'MiniMaxAI/MiniMax-M2.7', name: 'MiniMax M2.7' },
    ],
    icon: 'siliconflow',
    iconColor: '#000000',
    isPartner: true,
  },
  {
    id: 'aihubmix',
    name: 'AiHubMix',
    category: 'aggregator',
    apiFormat: 'anthropic',
    baseURL: 'https://aihubmix.com',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-haiku-4-5-20251001',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#006FFB',
  },
  {
    id: 'cherryin',
    name: 'CherryIN',
    category: 'aggregator',
    apiFormat: 'anthropic',
    baseURL: 'https://open.cherryin.net',
    defaultChatModel: 'anthropic/claude-sonnet-4.6',
    defaultCompletionModel: 'anthropic/claude-haiku-4.5',
    models: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8' },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
  },
  {
    id: 'dmxapi',
    name: 'DMXAPI',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://www.dmxapi.cn/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'shengsuanyun',
    name: 'Shengsuanyun',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://router.shengsuanyun.com/api/v1',
    defaultChatModel: 'anthropic/claude-sonnet-4.6',
    defaultCompletionModel: 'anthropic/claude-haiku-4.5',
    models: [
      { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8' },
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'unity2',
    name: 'Unity2.ai',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.unity2.ai/v1',
    defaultChatModel: 'gpt-5.5',
    defaultCompletionModel: 'gpt-5.4-mini',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    icon: 'openai',
    iconColor: '#00A67E',
    isPartner: true,
  },
  {
    id: 'subrouter',
    name: 'SubRouter',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://subrouter.ai/v1',
    defaultChatModel: 'gpt-5.5',
    defaultCompletionModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    icon: 'openrouter',
    iconColor: '#6566F1',
    isPartner: true,
  },
  {
    id: 'ccsub',
    name: 'CCSub',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://www.ccsub.net/v1',
    defaultChatModel: 'gpt-5.5',
    defaultCompletionModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    icon: 'openai',
    iconColor: '#00A67E',
    isPartner: true,
  },
  {
    id: 'compshare',
    name: 'Compshare (ModelVerse)',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.modelverse.cn/v1',
    defaultChatModel: 'ZhipuAI/GLM-5.1',
    defaultCompletionModel: 'ZhipuAI/GLM-5.1',
    models: [
      { id: 'ZhipuAI/GLM-5.1', name: 'GLM 5.1' },
    ],
    icon: 'zhipu',
    iconColor: '#0F62FE',
    isPartner: true,
  },
  {
    id: 'compshare-coding',
    name: 'Compshare Coding Plan',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://cp.compshare.cn/v1',
    defaultChatModel: 'ZhipuAI/GLM-5.1',
    defaultCompletionModel: 'ZhipuAI/GLM-5.1',
    models: [
      { id: 'ZhipuAI/GLM-5.1', name: 'GLM 5.1' },
    ],
    icon: 'zhipu',
    iconColor: '#0F62FE',
    isPartner: true,
  },
  {
    id: 'claudeapi',
    name: 'ClaudeAPI',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://gw.claudeapi.com/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'claude',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'runapi',
    name: 'RunAPI',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://runapi.co/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'atlascloud',
    name: 'AtlasCloud',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.atlascloud.ai/v1',
    defaultChatModel: 'zai-org/glm-5.1',
    defaultCompletionModel: 'zai-org/glm-5.1',
    models: [
      { id: 'zai-org/glm-5.1', name: 'GLM 5.1' },
    ],
    icon: 'zhipu',
    iconColor: '#0F62FE',
    isPartner: true,
  },
  {
    id: 'novita-ai',
    name: 'Novita AI',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.novita.ai/openai/v1',
    defaultChatModel: 'zai-org/glm-5.1',
    defaultCompletionModel: 'zai-org/glm-5.1',
    models: [
      { id: 'zai-org/glm-5.1', name: 'GLM 5.1' },
    ],
    icon: 'zhipu',
    iconColor: '#0F62FE',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    defaultChatModel: 'moonshotai/kimi-k2.5',
    defaultCompletionModel: 'moonshotai/kimi-k2.5',
    models: [
      { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5' },
    ],
    icon: 'nvidia',
    iconColor: '#76B900',
  },
  {
    id: 'modelscope',
    name: 'ModelScope',
    category: 'aggregator',
    apiFormat: 'openai_compat',
    baseURL: 'https://api-inference.modelscope.cn/v1',
    defaultChatModel: 'ZhipuAI/GLM-5.1',
    defaultCompletionModel: 'ZhipuAI/GLM-5.1',
    models: [
      { id: 'ZhipuAI/GLM-5.1', name: 'GLM 5.1' },
    ],
    icon: 'alibaba',
    iconColor: '#624AFF',
  },
  {
    id: 'pipellm',
    name: 'PIPELLM',
    category: 'aggregator',
    apiFormat: 'anthropic',
    baseURL: 'https://cc-api.pipellm.ai',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-haiku-4-5-20251001',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // THIRD-PARTY PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'patewayai',
    name: 'PatewayAI',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.pateway.ai/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'packycode',
    name: 'PackyCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://www.packyapi.com/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'apikeyfun',
    name: 'APIKEY.FUN',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.apikey.fun/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-haiku-4-5',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'apinebula',
    name: 'APINebula',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://apinebula.com/v1',
    defaultChatModel: 'gpt-5.5',
    defaultCompletionModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    icon: 'openai',
    iconColor: '#00A67E',
    isPartner: true,
  },
  {
    id: 'sudocode',
    name: 'SudoCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://sudocode.us/v1',
    defaultChatModel: 'gpt-5.5',
    defaultCompletionModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    icon: 'openai',
    iconColor: '#00A67E',
  },
  {
    id: 'claudecn',
    name: 'ClaudeCN',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://claudecn.top/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    icon: 'claude',
    iconColor: '#D4915D',
    isPartner: true,
  },
  {
    id: 'relaxycode',
    name: 'RelaxyCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://www.relaxycode.com/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
  },
  {
    id: 'cubence',
    name: 'Cubence',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.cubence.com/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#D4915D',
    isPartner: true,
    endpointCandidates: ['https://api.cubence.com', 'https://api-cf.cubence.com'],
  },
  {
    id: 'aigocode',
    name: 'AIGoCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.aigocode.com/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#5B7FFF',
    isPartner: true,
  },
  {
    id: 'rightcode',
    name: 'RightCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://right.codes/codex/v1',
    defaultChatModel: 'gpt-5.5',
    defaultCompletionModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    icon: 'openai',
    iconColor: '#E96B2C',
    isPartner: true,
  },
  {
    id: 'aicodemirror',
    name: 'AICodeMirror',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.aicodemirror.com/api/claudecode/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#000000',
    isPartner: true,
  },
  {
    id: 'crazyrouter',
    name: 'CrazyRouter',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://cn.crazyrouter.com/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#000000',
    isPartner: true,
  },
  {
    id: 'sssaicode',
    name: 'SSSAiCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://node-hk.sssaicodeapi.com/api/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
    icon: 'anthropic',
    iconColor: '#000000',
    isPartner: true,
  },
  {
    id: 'micu',
    name: 'Micu',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://www.micuapi.ai/v1',
    defaultChatModel: 'claude-sonnet-4-6',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    ],
    icon: 'anthropic',
    iconColor: '#000000',
    isPartner: true,
  },
  {
    id: 'etokai',
    name: 'ETok.ai',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://api.etok.ai/v1',
    defaultChatModel: 'claude-opus-4-8',
    defaultCompletionModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    ],
    icon: 'anthropic',
    iconColor: '#000000',
    isPartner: true,
  },
  {
    id: 'eflowcode',
    name: 'E-FlowCode',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://e-flowcode.cc/v1',
    defaultChatModel: 'gpt-5.2-codex',
    defaultCompletionModel: 'gpt-5.2-codex',
    models: [
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    ],
    icon: 'openai',
    iconColor: '#000000',
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    category: 'third_party',
    apiFormat: 'openai_compat',
    baseURL: 'https://opencode.ai/zen/go/v1',
    defaultChatModel: 'deepseek-v4-flash',
    defaultCompletionModel: 'deepseek-v4-flash',
    models: [
      { id: 'glm-5.2', name: 'GLM 5.2' },
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro' },
    ],
    icon: 'openai',
    iconColor: '#211E1E',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'third_party',
    apiFormat: 'openai_chat',
    baseURL: 'https://api.githubcopilot.com',
    defaultChatModel: 'claude-sonnet-4.6',
    defaultCompletionModel: 'claude-haiku-4.5',
    models: [
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    ],
    icon: 'github',
    iconColor: '#24292F',
    requiresOAuth: true,
  },
  {
    id: 'gemini-native',
    name: 'Gemini Native',
    category: 'third_party',
    apiFormat: 'google',
    baseURL: 'https://generativelanguage.googleapis.com',
    defaultChatModel: 'gemini-3.5-flash',
    defaultCompletionModel: 'gemini-3.5-flash',
    models: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
    icon: 'gemini',
    iconColor: '#4285F4',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CLOUD PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    category: 'cloud_provider',
    apiFormat: 'anthropic',
    baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
    defaultChatModel: 'global.anthropic.claude-sonnet-4-6',
    defaultCompletionModel: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    models: [
      { id: 'global.anthropic.claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'global.anthropic.claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
      { id: 'us.amazon.nova-pro-v1:0', name: 'Amazon Nova Pro' },
      { id: 'us.meta.llama4-maverick-17b-instruct-v1:0', name: 'Meta Llama 4 Maverick' },
      { id: 'us.deepseek.r1-v1:0', name: 'DeepSeek R1' },
    ],
    icon: 'aws',
    iconColor: '#FF9900',
  },
];
