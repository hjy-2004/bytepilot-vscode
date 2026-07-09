import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ToolCallEntry } from '../state/chat-store';
import { useChatStore } from '../state/chat-store';
import { usePlatform } from '../hooks/usePlatform';
import { DiffView } from './DiffView';

interface ToolCallCardProps { toolCall: ToolCallEntry; }

/** Formats seconds into a readable elapsed time string */
function formatElapsed(ms: number): string {
  if (ms < 1000) return '< 1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = React.memo(({ toolCall }) => {
  const { postMessage } = usePlatform();
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (toolCall.status === 'pending_approval') {
      setExpanded(true);
    }
  }, [toolCall.status]);

  // Track elapsed time for running tools
  useEffect(() => {
    if (toolCall.status === 'running') {
      startTime.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTime.current);
      }, 200);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [toolCall.status]);

  // Memoize expensive computations — avoids re-stringifying on every parent re-render
  const argsJson = useMemo(() => {
    if (Object.keys(toolCall.args).length === 0) return null;
    return JSON.stringify(toolCall.args, null, 2);
  }, [toolCall.args]);

  const displayResult = useMemo(() => {
    if (!toolCall.result) return null;
    return toolCall.result.length > 2000
      ? toolCall.result.slice(0, 2000) + '\n...(truncated)'
      : toolCall.result;
  }, [toolCall.result]);

  const isPending = toolCall.status === 'pending_approval';
  const isRunning = toolCall.status === 'running';
  const isDone = toolCall.status === 'done';
  const isError = toolCall.status === 'error';

  // Icon and status label
  let icon: string;
  let label: string;
  let barBg: string;
  if (isPending) {
    icon = '\u23F3'; label = 'Needs approval';
    barBg = 'var(--bytepilot-status-pending-bg)';
  } else if (isRunning) {
    icon = '\u23F3'; label = `Running... ${formatElapsed(elapsed)}`;
    barBg = 'var(--bytepilot-status-running-bg)';
  } else if (isDone) {
    icon = '\u2705'; label = 'Completed';
    barBg = 'var(--bytepilot-status-done-bg)';
  } else if (isError) {
    icon = '\u274C'; label = 'Failed';
    barBg = 'var(--bytepilot-status-error-bg)';
  } else {
    icon = '\u23F3'; label = '';
    barBg = 'var(--bytepilot-bg-primary)';
  }

  const borderColor = isPending ? 'var(--bytepilot-status-pending-border)'
    : isRunning ? 'var(--bytepilot-status-running-border)'
    : isDone ? 'var(--bytepilot-status-done-border)'
    : isError ? 'var(--bytepilot-status-error-border)'
    : 'var(--bytepilot-border)';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      margin: '6px 0',
      fontSize: '12px',
      overflow: 'hidden',
      transition: 'border-color 0.3s',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 8px',
          background: barBg,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.3s',
        }}
      >
        <span style={
          isRunning
            ? { animation: 'spin 1.2s linear infinite', display: 'inline-block' }
            : undefined
        }>
          {icon}
        </span>
        <span style={{ fontWeight: 600, flexShrink: 0 }}>{toolCall.displayName}</span>
        <span style={{
          opacity: 0.7,
          fontSize: '11px',
          flex: 1,
          color: isRunning ? 'var(--bytepilot-link-fg)' : undefined,
        }}>
          {label}
        </span>
        {/* Progress bar for running tools */}
        {isRunning && (
          <div style={{
            width: '60px',
            height: '3px',
            background: 'var(--bytepilot-border)',
            borderRadius: '2px',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <div style={{
              height: '100%',
              background: 'var(--bytepilot-link-fg)',
              borderRadius: '2px',
              animation: 'pulseBar 1.5s ease-in-out infinite',
              width: '100%',
            }} />
          </div>
        )}
        <span style={{ opacity: 0.4, fontSize: '10px' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '6px 8px' }}>
          {isPending ? (
            <>
              {toolCall.diff ? (
                <DiffView diff={toolCall.diff} />
              ) : (
                argsJson && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>Arguments:</div>
                    <pre style={{
                      background: 'var(--bytepilot-code-bg)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      overflow: 'auto',
                      maxHeight: '120px',
                      margin: 0,
                    }}>
                      {argsJson}
                    </pre>
                  </div>
                )
              )}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    useChatStore.getState().setToolRunning(toolCall.id);
                    postMessage({ type: 'tool.reject', payload: { toolCallId: toolCall.id, reason: 'Rejected' } } as any);
                  }}
                  style={{ padding: '3px 12px', fontSize: '12px' }}
                >
                  Reject
                </button>
                <button
                  className="btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    useChatStore.getState().setToolRunning(toolCall.id);
                    postMessage({ type: 'tool.approve', payload: { toolCallId: toolCall.id } } as any);
                  }}
                  style={{ padding: '3px 12px', fontSize: '12px' }}
                >
                  Approve
                </button>
              </div>
            </>
          ) : (
            <>
              {argsJson && !toolCall.diff && (
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Arguments:</div>
                  <pre style={{
                    background: 'var(--bytepilot-code-bg)',
                    padding: '4px 8px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    overflow: 'auto',
                    maxHeight: '120px',
                    margin: 0,
                  }}>
                    {argsJson}
                  </pre>
                </div>
              )}
              {isRunning && !toolCall.result && (
                <div style={{
                  padding: '16px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: 'var(--bytepilot-fg-secondary)',
                  fontSize: '12px',
                }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span className="thinking-dot" style={{ animationDelay: '0s' }} />
                    <span className="thinking-dot" style={{ animationDelay: '0.2s' }} />
                    <span className="thinking-dot" style={{ animationDelay: '0.4s' }} />
                  </div>
                  Executing...
                </div>
              )}
              {toolCall.result && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                    Result ({toolCall.success ? 'Success' : 'Error'}):
                  </div>
                  {toolCall.diff ? (
                    <DiffView diff={toolCall.diff} />
                  ) : (
                    <pre style={{
                      background: 'var(--bytepilot-code-bg)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {displayResult}
                    </pre>
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
