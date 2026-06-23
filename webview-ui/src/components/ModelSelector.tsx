import React from 'react';
import type { ConfigState } from '../state/chat-store';

interface ModelSelectorProps {
  config: ConfigState | null;
  onSetup: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ config, onSetup }) => {
  if (!config?.initialized) {
    return (
      <button
        onClick={onSetup}
        style={{
          fontSize: '11px',
          color: 'var(--vscode-button-foreground)',
          background: 'var(--vscode-button-background)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: 'none',
          cursor: 'pointer',
        }}
        title="Import config or configure AI provider"
      >
        Setup AI
      </button>
    );
  }

  return (
    <span style={{
      fontSize: '11px',
      color: 'var(--vscode-descriptionForeground)',
      background: 'var(--vscode-badge-background)',
      padding: '1px 6px',
      borderRadius: '8px',
    }}>
      {config.displayProvider || config.provider} / {config.chatModel}
    </span>
  );
};
