import React, { useState, useCallback } from 'react';

interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

interface SessionSelectorProps {
  sessions: SessionInfo[];
  activeId: string | null;
  onSwitch: (sessionId: string) => void;
  onNew: () => void;
  onDelete: (sessionId: string) => void;
}

export const SessionSelector: React.FC<SessionSelectorProps> = ({
  sessions, activeId, onSwitch, onNew, onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const active = sessions.find(s => s.id === activeId);

  const handleSelect = useCallback((id: string) => {
    onSwitch(id);
    setOpen(false);
  }, [onSwitch]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title={active?.title || 'Select session'}
        style={{
          background: 'var(--vscode-dropdown-background)',
          color: 'var(--vscode-dropdown-foreground)',
          border: '1px solid var(--vscode-dropdown-border)',
          padding: '2px 6px',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '11px',
          maxWidth: '140px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {active?.title || 'Chat'}
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100,
            background: 'var(--vscode-dropdown-background)',
            border: '1px solid var(--vscode-dropdown-border)',
            borderRadius: '4px',
            minWidth: '200px',
            maxHeight: '240px',
            overflow: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            marginTop: '2px',
          }}>
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => handleSelect(s.id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px', cursor: 'pointer', fontSize: '12px',
                  background: s.id === activeId ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: s.id === activeId ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
                }}
                onMouseEnter={e => { if (s.id !== activeId) (e.target as HTMLElement).style.background = 'var(--vscode-list-hoverBackground)'; }}
                onMouseLeave={e => { if (s.id !== activeId) (e.target as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                  <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '10px', marginLeft: '4px' }}>
                    ({s.messageCount})
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                  title="Delete session"
                  style={{
                    background: 'none', border: 'none', color: 'var(--vscode-descriptionForeground)',
                    cursor: 'pointer', fontSize: '12px', padding: '0 2px',
                  }}
                >
                  &#10005;
                </button>
              </div>
            ))}
            <div
              onClick={() => { onNew(); setOpen(false); }}
              style={{
                padding: '4px 8px', cursor: 'pointer', fontSize: '12px',
                borderTop: '1px solid var(--vscode-dropdown-border)',
                color: 'var(--vscode-textLink-foreground)',
              }}
            >
              + New Chat
            </div>
          </div>
        </>
      )}
    </div>
  );
};
