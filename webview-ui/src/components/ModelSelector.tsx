import React, { useState } from 'react';
import type { ConfigState } from '../state/chat-store';

interface ModelSelectorProps {
  config: ConfigState | null;
  onSetup: () => void;
  onChangeModel: (model: string) => void;
  onChangeSettings: (settings: { provider?: string; chatModel?: string; baseURL?: string; apiKey?: string }) => void;
}

const COMMON_MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001', 'deepseek-v4-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
  ollama: ['codellama', 'llama3', 'deepseek-coder-v2', 'mistral', 'qwen2.5-coder'],
};

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude / DeepSeek)', defaultBaseURL: '' },
  { id: 'openai', label: 'OpenAI (GPT)', defaultBaseURL: '' },
  { id: 'ollama', label: 'Ollama (Local)', defaultBaseURL: 'http://localhost:11434/v1' },
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({ config, onSetup, onChangeModel, onChangeSettings }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'quick' | 'custom'>('quick');
  const [customModel, setCustomModel] = useState('');
  const [customURL, setCustomURL] = useState('');
  const [customKey, setCustomKey] = useState('');

  if (!config?.initialized) {
    return (
      <button onClick={onSetup} style={{ fontSize: '11px', color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)', padding: '2px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
        Setup AI
      </button>
    );
  }

  const provider = config.provider;
  const models = COMMON_MODELS[provider] || [];

  const handleQuickPick = (model: string) => {
    onChangeModel(model);
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (!customModel.trim()) return;
    onChangeSettings({
      chatModel: customModel.trim(),
      baseURL: customURL.trim() || undefined,
      apiKey: customKey.trim() || undefined,
    });
    setOpen(false);
  };

  const handleProviderChange = (newProvider: string) => {
    const p = PROVIDERS.find(p => p.id === newProvider);
    onChangeSettings({
      provider: newProvider,
      baseURL: p?.defaultBaseURL || undefined,
    });
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <span
        onClick={() => {
          setOpen(!open);
          setCustomModel(config.chatModel);
          setCustomURL('');
          setCustomKey('');
          setTab('quick');
        }}
        title="Model settings"
        style={{
          fontSize: '11px', color: 'var(--vscode-descriptionForeground)',
          background: 'var(--vscode-badge-background)', padding: '2px 8px',
          borderRadius: '8px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        {config.displayProvider || config.provider} / {config.chatModel}
      </span>

      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 99,
            background: 'var(--vscode-dropdown-background)',
            border: '1px solid var(--vscode-dropdown-border)',
            borderRadius: '6px', minWidth: '240px', maxWidth: '300px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            marginTop: '4px', padding: '8px', fontSize: '12px',
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button
                onClick={() => setTab('quick')}
                style={{
                  flex: 1, padding: '3px 6px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
                  background: tab === 'quick' ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
                  color: tab === 'quick' ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
                }}
              >Models</button>
              <button
                onClick={() => setTab('custom')}
                style={{
                  flex: 1, padding: '3px 6px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
                  background: tab === 'custom' ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
                  color: tab === 'custom' ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
                }}
              >Custom</button>
            </div>

            {tab === 'quick' ? (
              <>
                {/* Provider switch */}
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '2px' }}>Provider</div>
                  <select
                    value={provider}
                    onChange={e => handleProviderChange(e.target.value)}
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px',
                      background: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)',
                      border: '1px solid var(--vscode-dropdown-border)', borderRadius: '3px',
                    }}
                  >
                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>

                {/* Model list */}
                <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '2px' }}>Model</div>
                {models.map(m => (
                  <div
                    key={m}
                    onClick={() => handleQuickPick(m)}
                    style={{
                      padding: '3px 6px', cursor: 'pointer', borderRadius: '3px',
                      background: m === config.chatModel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                      color: m === config.chatModel ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
                    }}
                    onMouseEnter={e => { if (m !== config.chatModel) (e.target as HTMLElement).style.background = 'var(--vscode-list-hoverBackground)'; }}
                    onMouseLeave={e => { if (m !== config.chatModel) (e.target as HTMLElement).style.background = 'transparent'; }}
                  >
                    {m}
                  </div>
                ))}
              </>
            ) : (
              <div>
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>Model ID</div>
                  <input
                    autoFocus
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="e.g. gpt-4o"
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px', boxSizing: 'border-box',
                      background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>Base URL (optional)</div>
                  <input
                    value={customURL}
                    onChange={e => setCustomURL(e.target.value)}
                    placeholder={config.baseURL || 'https://api.openai.com/v1'}
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px', boxSizing: 'border-box',
                      background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>API Key (optional)</div>
                  <input
                    type="password"
                    value={customKey}
                    onChange={e => setCustomKey(e.target.value)}
                    placeholder="sk-..."
                    style={{
                      width: '100%', fontSize: '11px', padding: '2px 4px', boxSizing: 'border-box',
                      background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)', borderRadius: '3px', outline: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={handleCustomApply}
                  disabled={!customModel.trim()}
                  style={{
                    width: '100%', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
                    background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)',
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
