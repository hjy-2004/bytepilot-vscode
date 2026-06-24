import React, { useState, useEffect } from 'react';
import type { ToolCallEntry } from '../state/chat-store';
import { useChatStore } from '../state/chat-store';
import { useVSCode } from '../hooks/useVSCode';
import { DiffView } from './DiffView';

interface ToolCallCardProps { toolCall: ToolCallEntry; }

export const ToolCallCard: React.FC<ToolCallCardProps> = React.memo(({ toolCall }) => {
  const { postMessage } = useVSCode();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (toolCall.status === 'pending_approval') setExpanded(true);
  }, [toolCall.status]);

  const isPending = toolCall.status === 'pending_approval';
  const isRunning = toolCall.status === 'running';
  const icon = isPending ? '\u23F3' : isRunning ? '\u23F3' : toolCall.status === 'done' ? '\u2705' : toolCall.status === 'error' ? '\u274C' : '\u23F3';
  const label = isPending ? 'Needs approval' : isRunning ? 'Running...' : '';

  return (
    <div style={{ border: `1px solid ${isPending ? '#cca700' : 'var(--vscode-panel-border)'}`, borderRadius: '4px', margin: '6px 0', fontSize: '12px', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: isPending ? 'rgba(204,167,0,0.1)' : 'var(--vscode-sideBar-background)', cursor: 'pointer', userSelect: 'none' }}>
        <span style={isRunning ? { animation: 'spin 1.2s linear infinite', display: 'inline-block' } : undefined}>{icon}</span>
        <span style={{ fontWeight: 600 }}>{toolCall.displayName}</span>
        <span style={{ opacity: 0.6, fontSize: '11px', flex: 1 }}>{label}</span>
        <span style={{ opacity: 0.4 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '6px 8px' }}>
          {isPending ? (
            <>
              {toolCall.diff ? <DiffView diff={toolCall.diff} /> : (
                Object.keys(toolCall.args).length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>Arguments:</div>
                    <pre style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', overflow: 'auto', maxHeight: '120px', margin: 0 }}>{JSON.stringify(toolCall.args, null, 2)}</pre>
                  </div>
                )
              )}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); useChatStore.getState().setToolRunning(toolCall.id); postMessage({ type: 'tool.reject', payload: { toolCallId: toolCall.id, reason: 'Rejected' } } as any); }} style={{ padding: '3px 12px', fontSize: '12px' }}>Reject</button>
                <button className="btn-primary" onClick={(e) => { e.stopPropagation(); useChatStore.getState().setToolRunning(toolCall.id); postMessage({ type: 'tool.approve', payload: { toolCallId: toolCall.id } } as any); }} style={{ padding: '3px 12px', fontSize: '12px' }}>Approve</button>
              </div>
            </>
          ) : (
            <>
              {Object.keys(toolCall.args).length > 0 && !toolCall.diff && (
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Arguments:</div>
                  <pre style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', overflow: 'auto', maxHeight: '120px', margin: 0 }}>{JSON.stringify(toolCall.args, null, 2)}</pre>
                </div>
              )}
              {toolCall.result && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Result ({toolCall.success ? 'Success' : 'Error'}):</div>
                  {toolCall.diff ? <DiffView diff={toolCall.diff} /> : (
                    <pre style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', overflow: 'auto', maxHeight: '200px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{toolCall.result.length > 2000 ? toolCall.result.slice(0, 2000) + '\n...(truncated)' : toolCall.result}</pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
