import React, { useState } from 'react';
import type { ConfigState } from '../state/chat-store';

interface ModelSelectorProps {
  config: ConfigState | null;
  onSetup: () => void;
  onChangeModel: (model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ config, onSetup, onChangeModel }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  if (!config?.initialized) {
    return (
      <button onClick={onSetup} style={{ fontSize: '11px', color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)', padding: '2px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
        Setup AI
      </button>
    );
  }

  if (editing) {
    return (
      <form
        onSubmit={e => { e.preventDefault(); if (value.trim()) onChangeModel(value.trim()); setEditing(false); }}
        style={{ display: 'flex', gap: '2px' }}
      >
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={config.chatModel}
          style={{
            fontSize: '11px', padding: '1px 4px', width: '140px',
            background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-focusBorder)', borderRadius: '3px', outline: 'none',
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
        />
      </form>
    );
  }

  return (
    <span
      onClick={() => { setValue(config.chatModel); setEditing(true); }}
      title="Click to change model"
      style={{
        fontSize: '11px', color: 'var(--vscode-descriptionForeground)',
        background: 'var(--vscode-badge-background)', padding: '2px 8px',
        borderRadius: '8px', cursor: 'pointer', userSelect: 'none',
      }}
    >
      {config.displayProvider || config.provider} / {config.chatModel}
    </span>
  );
};
