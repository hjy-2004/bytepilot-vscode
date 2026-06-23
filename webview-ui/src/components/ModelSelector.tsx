import React from 'react';
import type { ConfigState } from '../state/chat-store';

interface ModelSelectorProps {
  config: ConfigState | null;
  onSetup: () => void;
  onOpenSettings: () => void;
  onChangeModel: (model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ config, onSetup, onOpenSettings, onChangeModel }) => {
  if (!config?.initialized) {
    return (
      <button onClick={onSetup} style={{ fontSize: '11px', color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)', padding: '2px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer' }} title="Import config">
        Setup AI
      </button>
    );
  }

  const handleClick = () => {
    const model = prompt('Change model:', config.chatModel);
    if (model && model.trim()) {
      onChangeModel(model.trim());
    }
  };

  return (
    <span
      onClick={handleClick}
      title="Click to change model"
      style={{
        fontSize: '11px', color: 'var(--vscode-descriptionForeground)',
        background: 'var(--vscode-badge-background)', padding: '2px 8px',
        borderRadius: '8px', cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {config.displayProvider || config.provider} / {config.chatModel}
    </span>
  );
};
