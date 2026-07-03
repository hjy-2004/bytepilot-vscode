import React, { useState, useMemo } from 'react';
import type { ConfigState } from '../state/chat-store';

interface ModelSelectorProps {
  config: ConfigState | null;
  onSetup: () => void;
  onChangeModel: (model: string) => void;
  onChangeSettings: (settings: { provider?: string; chatModel?: string; baseURL?: string }) => void;
  onSetKey?: (providerId: string, apiKey: string) => void;
  onFetchModels?: () => void;
  fetchedModels?: { id: string; name: string }[];
  isFetchingModels?: boolean;
}

// ── Expanded Provider + Model Catalog (from cc-switch knowledge base) ────────

interface ProviderEntry {
  id: string;
  label: string;
  defaultBaseURL: string;
  category: 'official' | 'cn_official' | 'aggregator' | 'third_party' | 'cloud';
  models: string[];
}

const PROVIDERS: ProviderEntry[] = [
  // Official
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultBaseURL: 'https://api.anthropic.com', category: 'official',
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { id: 'openai', label: 'OpenAI (GPT)', defaultBaseURL: 'https://api.openai.com/v1', category: 'official',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'] },
  { id: 'google', label: 'Google (Gemini)', defaultBaseURL: 'https://generativelanguage.googleapis.com', category: 'official',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'] },
  { id: 'deepseek', label: 'DeepSeek', defaultBaseURL: 'https://api.deepseek.com/v1', category: 'cn_official',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { id: 'ollama', label: 'Ollama (Local)', defaultBaseURL: 'http://localhost:11434/v1', category: 'official',
    models: ['codellama', 'llama3', 'deepseek-coder-v2', 'mistral', 'qwen2.5-coder'] },
  { id: 'azure-openai', label: 'Azure OpenAI', defaultBaseURL: '', category: 'official',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },

  // Chinese Official
  { id: 'kimi', label: 'Kimi (Moonshot)', defaultBaseURL: 'https://api.moonshot.cn/v1', category: 'cn_official',
    models: ['kimi-k2.7-code', 'kimi-k2.6'] },
  { id: 'zhipu', label: 'Zhipu GLM', defaultBaseURL: 'https://open.bigmodel.cn/api/coding/paas/v4', category: 'cn_official',
    models: ['glm-5.1'] },
  { id: 'minimax', label: 'MiniMax', defaultBaseURL: 'https://api.minimaxi.com/v1', category: 'cn_official',
    models: ['MiniMax-M2.7'] },
  { id: 'stepfun', label: 'StepFun', defaultBaseURL: 'https://api.stepfun.com/step_plan/v1', category: 'cn_official',
    models: ['step-3.5-flash-2603', 'step-3.5-flash'] },
  { id: 'bailian', label: 'Bailian (Alibaba)', defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', category: 'cn_official',
    models: ['qwen3.7-max', 'qwen2.5-coder'] },
  { id: 'baidu-qianfan', label: 'Baidu Qianfan', defaultBaseURL: 'https://qianfan.baidubce.com/anthropic/coding', category: 'cn_official',
    models: ['qianfan-code-latest'] },
  { id: 'volcano', label: 'Volcano AgentPlan', defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3', category: 'cn_official',
    models: ['ark-code-latest'] },
  { id: 'doubao', label: 'DouBao Seed', defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/v3', category: 'cn_official',
    models: ['doubao-seed-2-1-pro'] },
  { id: 'xiaomi-mimo', label: 'Xiaomi MiMo', defaultBaseURL: 'https://api.xiaomimimo.com/v1', category: 'cn_official',
    models: ['mimo-v2.5-pro', 'mimo-v2.5'] },
  { id: 'longcat', label: 'Longcat', defaultBaseURL: 'https://api.longcat.chat/v1', category: 'cn_official',
    models: ['LongCat-Flash-Chat'] },

  // Aggregators
  { id: 'openrouter', label: 'OpenRouter', defaultBaseURL: 'https://openrouter.ai/api/v1', category: 'aggregator',
    models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.8', 'anthropic/claude-haiku-4.5'] },
  { id: 'siliconflow', label: 'SiliconFlow', defaultBaseURL: 'https://api.siliconflow.cn/v1', category: 'aggregator',
    models: ['Pro/MiniMaxAI/MiniMax-M2.7', 'deepseek-ai/DeepSeek-V3'] },
  { id: 'aihubmix', label: 'AiHubMix', defaultBaseURL: 'https://aihubmix.com', category: 'aggregator',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8'] },
  { id: 'cherryin', label: 'CherryIN', defaultBaseURL: 'https://open.cherryin.net', category: 'aggregator',
    models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.8'] },
  { id: 'shengsuanyun', label: 'Shengsuanyun', defaultBaseURL: 'https://router.shengsuanyun.com/api/v1', category: 'aggregator',
    models: ['anthropic/claude-opus-4.8', 'anthropic/claude-sonnet-4.6'] },

  // Third-Party
  { id: 'openai-compatible', label: 'OpenAI Compatible (Generic)', defaultBaseURL: '', category: 'third_party',
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-6', 'deepseek-v4-pro', 'glm-5.1'] },
];

const CATEGORY_LABELS: Record<string, string> = {
  official: 'Official',
  cn_official: 'Chinese Official',
  aggregator: 'Aggregator',
  third_party: 'Third-Party',
  cloud: 'Cloud',
};

export const ModelSelector: React.FC<ModelSelectorProps> = ({ config, onSetup, onChangeModel, onChangeSettings, onSetKey, onFetchModels, fetchedModels, isFetchingModels }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'quick' | 'custom'>('quick');
  const [customModel, setCustomModel] = useState('');
  const [customURL, setCustomURL] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [search, setSearch] = useState('');

  if (!config?.initialized) {
    return (
      <button onClick={onSetup} style={{ fontSize: '11px', color: 'var(--bytepilot-btn-fg)', background: 'var(--bytepilot-btn-bg)', padding: '2px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
        Setup AI
      </button>
    );
  }

  const provider = config.provider;
  const baseURL = config.baseURL || '';

  // Infer "effective" provider from baseURL, overriding the raw provider field.
  // This is needed because the plugin often sets provider='anthropic' while
  // the baseURL points to deepseek.com (DeepSeek's Anthropic-compatible endpoint).
  const effectiveProvider = useMemo(() => {
    const url = baseURL.toLowerCase();
    if (url.includes('deepseek.com')) return 'deepseek';
    if (url.includes('moonshot.cn')) return 'kimi';
    if (url.includes('bigmodel.cn') || url.includes('api.z.ai')) return 'zhipu';
    if (url.includes('minimaxi.com') || url.includes('minimax.io')) return 'minimax';
    if (url.includes('stepfun.com') || url.includes('stepfun.ai')) return 'stepfun';
    if (url.includes('dashscope.aliyuncs.com')) return 'bailian';
    if (url.includes('qianfan.baidubce.com')) return 'baidu-qianfan';
    if (url.includes('volces.com')) return 'volcano';
    if (url.includes('xiaomimimo.com')) return 'xiaomi-mimo';
    if (url.includes('longcat.chat')) return 'longcat';
    if (url.includes('openrouter.ai')) return 'openrouter';
    if (url.includes('siliconflow.cn') || url.includes('siliconflow.com')) return 'siliconflow';
    if (url.includes('aihubmix.com')) return 'aihubmix';
    if (url.includes('cherryin.net')) return 'cherryin';
    if (url.includes('shengsuanyun.com')) return 'shengsuanyun';
    return provider;
  }, [baseURL, provider]);

  // Find matching provider entry (prefer effective, then raw provider)
  const currentProvider = PROVIDERS.find(p => p.id === effectiveProvider)
                       || PROVIDERS.find(p => p.id === provider);

  // Models: prefer fetched model IDs, fall back to preset models
  const presetModels = useMemo(() => {
    const p = PROVIDERS.find(p => p.id === effectiveProvider)
           || PROVIDERS.find(p => p.id === provider);
    return p?.models || [];
  }, [effectiveProvider, provider]);

  // fetchedModels are {id, name} objects — extract just the id for display
  const fetchedModelIds = useMemo(() => {
    if (!fetchedModels || fetchedModels.length === 0) return null;
    return fetchedModels.map(m => m.id);
  }, [fetchedModels]);

  const models = fetchedModelIds || presetModels;

  // Group providers by category
  const groupedProviders = useMemo(() => {
    const order = ['official', 'cn_official', 'aggregator', 'third_party', 'cloud'];
    const filtered = search.trim()
      ? PROVIDERS.filter(p => p.label.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.toLowerCase()))
      : PROVIDERS;
    const groups: { category: string; items: ProviderEntry[] }[] = [];
    for (const cat of order) {
      const items = filtered.filter(p => p.category === cat);
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [search]);

  const handleQuickPick = (model: string) => {
    onChangeModel(model);
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (!customModel.trim()) return;
    onChangeSettings({
      chatModel: customModel.trim(),
      baseURL: customURL.trim() || undefined,
    });
    // Store API key per provider in SecretStorage (not settings.json)
    if (customKey.trim() && onSetKey) {
      const effectiveId = PROVIDERS.find(p => p.id === effectiveProvider)?.id || provider;
      onSetKey(effectiveId, customKey.trim());
    }
    setOpen(false);
  };

  const handleProviderChange = (newProvider: string) => {
    const p = PROVIDERS.find(p => p.id === newProvider);
    onChangeSettings({
      provider: newProvider,
      baseURL: p?.defaultBaseURL ?? '',
      chatModel: p?.models?.[0] ?? '', // reset model to new provider's default
    });
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', zIndex: 100 }}>
      <span
        onClick={() => {
          setOpen(!open);
          setCustomModel(config.chatModel);
          setCustomURL('');
          setCustomKey('');
          setTab('quick');
          setSearch('');
        }}
        title="Model settings"
        style={{
          fontSize: '11px', color: 'var(--bytepilot-fg-secondary)',
          background: 'var(--bytepilot-badge-bg)', padding: '2px 8px',
          borderRadius: '8px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        {config.displayProvider || config.provider} / {config.chatModel}
      </span>

      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: '50px', right: '12px', zIndex: 99999,
            background: 'var(--bytepilot-dropdown-bg)',
            border: '1px solid var(--bytepilot-dropdown-border)',
            borderRadius: '6px', minWidth: '280px', maxWidth: '340px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            marginTop: '4px', padding: '8px', fontSize: '12px',
            maxHeight: 'calc(100vh - 150px)', overflowY: 'auto',
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button
                onClick={() => setTab('quick')}
                style={{
                  flex: 1, padding: '3px 6px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
                  background: tab === 'quick' ? 'var(--bytepilot-btn-bg)' : 'var(--bytepilot-btn-secondary-bg)',
                  color: tab === 'quick' ? 'var(--bytepilot-btn-fg)' : 'var(--bytepilot-btn-secondary-fg)',
                }}
              >Provider & Model</button>
              <button
                onClick={() => setTab('custom')}
                style={{
                  flex: 1, padding: '3px 6px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
                  background: tab === 'custom' ? 'var(--bytepilot-btn-bg)' : 'var(--bytepilot-btn-secondary-bg)',
                  color: tab === 'custom' ? 'var(--bytepilot-btn-fg)' : 'var(--bytepilot-btn-secondary-fg)',
                }}
              >Custom</button>
            </div>

            {tab === 'quick' ? (
              <>
                {/* Search */}
                <div style={{ marginBottom: '6px' }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filter providers..."
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 6px', boxSizing: 'border-box',
                      background: 'var(--bytepilot-input-bg)', color: 'var(--bytepilot-input-fg)',
                      border: '1px solid var(--bytepilot-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>

                {/* Provider groups */}
                {groupedProviders.map(group => (
                  <div key={group.category} style={{ marginBottom: '4px' }}>
                    <div style={{
                      fontSize: '10px', color: 'var(--bytepilot-fg-secondary)',
                      padding: '2px 0', fontWeight: 600, textTransform: 'uppercase',
                    }}>
                      {CATEGORY_LABELS[group.category] || group.category}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {group.items.map(p => (
                        <span
                          key={p.id}
                          onClick={() => handleProviderChange(p.id)}
                          title={`${p.label}${p.defaultBaseURL ? ' - ' + p.defaultBaseURL : ''}`}
                          style={{
                            fontSize: '10px', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer',
                            background: p.id === provider ? 'var(--bytepilot-btn-bg)' : 'var(--bytepilot-badge-bg)',
                            color: p.id === provider ? 'var(--bytepilot-btn-fg)' : 'var(--bytepilot-badge-fg)',
                            border: '1px solid transparent',
                          }}
                        >
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Model list for current provider */}
                {models.length > 0 && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '8px', marginBottom: '2px',
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--bytepilot-fg-secondary)', fontWeight: 600 }}>
                        Models ({currentProvider?.label || provider}){fetchedModelIds ? ` · ${fetchedModelIds.length} fetched` : ''}
                      </span>
                      {onFetchModels && (
                        <span
                          onClick={(e) => { e.stopPropagation(); onFetchModels(); }}
                          title="Fetch model list from API"
                          style={{
                            fontSize: '14px', cursor: 'pointer', opacity: isFetchingModels ? 0.4 : 0.7,
                            userSelect: 'none', lineHeight: 1,
                          }}
                        >
                          {isFetchingModels ? '⏳' : '🔄'}
                        </span>
                      )}
                    </div>
                    {models.map(m => (
                      <div
                        key={m}
                        onClick={() => handleQuickPick(m)}
                        style={{
                          padding: '3px 6px', cursor: 'pointer', borderRadius: '3px',
                          background: m === config.chatModel ? 'var(--bytepilot-list-active-bg)' : 'transparent',
                          color: m === config.chatModel ? 'var(--bytepilot-list-active-fg)' : 'var(--bytepilot-fg-primary)',
                        }}
                        onMouseEnter={e => { if (m !== config.chatModel) (e.target as HTMLElement).style.background = 'var(--bytepilot-list-hover-bg)'; }}
                        onMouseLeave={e => { if (m !== config.chatModel) (e.target as HTMLElement).style.background = 'transparent'; }}
                      >
                        {m}
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : (
              <div>
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--bytepilot-fg-secondary)' }}>Model ID</div>
                  <input
                    autoFocus
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="e.g. gpt-4o"
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px', boxSizing: 'border-box',
                      background: 'var(--bytepilot-input-bg)', color: 'var(--bytepilot-input-fg)',
                      border: '1px solid var(--bytepilot-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--bytepilot-fg-secondary)' }}>Base URL (optional)</div>
                  <input
                    value={customURL}
                    onChange={e => setCustomURL(e.target.value)}
                    placeholder={config.baseURL || 'https://api.openai.com/v1'}
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px', boxSizing: 'border-box',
                      background: 'var(--bytepilot-input-bg)', color: 'var(--bytepilot-input-fg)',
                      border: '1px solid var(--bytepilot-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--bytepilot-fg-secondary)' }}>API Key (optional)</div>
                  <input
                    type="password"
                    value={customKey}
                    onChange={e => setCustomKey(e.target.value)}
                    placeholder="sk-..."
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px', boxSizing: 'border-box',
                      background: 'var(--bytepilot-input-bg)', color: 'var(--bytepilot-input-fg)',
                      border: '1px solid var(--bytepilot-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={handleCustomApply}
                  disabled={!customModel.trim()}
                  style={{
                    width: '100%', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
                    background: 'var(--bytepilot-btn-bg)', color: 'var(--bytepilot-btn-fg)',
                    opacity: customModel.trim() ? 1 : 0.5,
                  }}
                >Apply</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
