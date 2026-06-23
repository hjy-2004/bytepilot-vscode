import React, { useState } from 'react';
import type { ToolCallEntry } from '../state/chat-store';

interface ToolCallCardProps {
  toolCall: ToolCallEntry;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = toolCall.status === 'running'
    ? '\u23F3' // hourglass
    : toolCall.status === 'done'
      ? '\u2705' // checkmark
      : toolCall.status === 'error'
        ? '\u274C' // cross mark
        : '\u23F3';

  return (
    <div style={{
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '4px',
      margin: '6px 0',
      fontSize: '12px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: 'var(--vscode-sideBar-background)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span>{statusIcon}</span>
        <span style={{ fontWeight: 600 }}>{toolCall.displayName}</span>
        <span style={{ opacity: 0.6, fontSize: '11px', flex: 1 }}>
          {toolCall.status === 'running' ? 'Running...' : ''}
        </span>
        <span style={{ opacity: 0.4 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '6px 8px' }}>
          {/* Args */}
          {Object.keys(toolCall.args).length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Arguments:</div>
              <pre style={{
                background: 'var(--vscode-textCodeBlock-background)',
                padding: '4px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                overflow: 'auto',
                maxHeight: '120px',
                margin: 0,
              }}>
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {toolCall.result && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                Result ({toolCall.success ? 'Success' : 'Error'}):
              </div>
              <pre style={{
                background: 'var(--vscode-textCodeBlock-background)',
                padding: '4px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                overflow: 'auto',
                maxHeight: '200px',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {toolCall.result.length > 2000
                  ? toolCall.result.slice(0, 2000) + '\n...(truncated)'
                  : toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
