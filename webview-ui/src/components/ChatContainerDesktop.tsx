import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ContextIndicator } from './ContextIndicator';
import { ModelSelector } from './ModelSelector';
import type { ChatMessage, ConfigState } from '../state/chat-store';

interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

interface ChatContainerDesktopProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  contextInfo: { openFiles: string[]; projectFiles: number; diagnosticsCount: number; hasRules: boolean };
  config: ConfigState | null;
  onSend: (content: string, attachments?: Array<{ name: string; content: string; type: 'image'; mimeType: string }>) => void;
  onCancel: () => void;
  onSetup: () => void;
  onChangeModel: (model: string) => void;
  onChangeSettings: (settings: { provider?: string; chatModel?: string; baseURL?: string }) => void;
  onSetKey?: (providerId: string, apiKey: string) => void;
  onFetchModels?: () => void;
  fetchedModels?: { id: string; name: string }[];
  isFetchingModels?: boolean;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onPickWorkspace?: () => void;
  workspaceRoot?: string;
}

export const ChatContainerDesktop: React.FC<ChatContainerDesktopProps> = ({
  messages,
  streamingText,
  isStreaming,
  contextInfo,
  config,
  onSend,
  onCancel,
  onSetup,
  onChangeModel,
  onChangeSettings,
  onSetKey,
  onFetchModels,
  fetchedModels,
  isFetchingModels,
  sessions,
  activeSessionId,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onPickWorkspace,
  workspaceRoot,
}) => {
  const hasContent = messages.length > 0 || streamingText;

  return (
    <div className="desktop-layout">
      {/* ── Left sidebar ─────────────────────────── */}
      <div className="desktop-sidebar">
        <div className="desktop-sidebar-header">
          <span className="desktop-sidebar-title">BytePilot</span>
          <button className="desktop-sidebar-new-btn" onClick={onNewSession}>
            + New
          </button>
        </div>

        <div className="desktop-session-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`desktop-session-item${s.id === activeSessionId ? ' active' : ''}`}
              onClick={() => onSwitchSession(s.id)}
            >
              <span className="desktop-session-item-title">{s.title}</span>
              <span className="desktop-session-item-count">({s.messageCount})</span>
              <button
                className="desktop-session-item-delete"
                onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                title="Delete session"
              >
                &#10005;
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div style={{ padding: '12px 10px', fontSize: '12px', color: 'var(--bytepilot-fg-secondary)', textAlign: 'center' }}>
              No sessions yet
            </div>
          )}
        </div>

        {onPickWorkspace && (
          <div className="desktop-sidebar-footer">
            <span style={{ flexShrink: 0 }}>&#128193;</span>
            <span className="desktop-sidebar-footer-path">
              {workspaceRoot || 'No folder'}
            </span>
            <button className="desktop-sidebar-footer-btn" onClick={onPickWorkspace}>
              Open
            </button>
          </div>
        )}
      </div>

      {/* ── Right main column ───────────────────── */}
      <div className="desktop-main">
        {/* Top bar */}
        <div className="desktop-topbar">
          <div className="desktop-topbar-left">
            <ContextIndicator
              openFiles={contextInfo.openFiles}
              projectFiles={contextInfo.projectFiles}
              diagnosticsCount={contextInfo.diagnosticsCount}
              hasRules={contextInfo.hasRules}
            />
          </div>
          <div className="desktop-topbar-right">
            <ModelSelector
              config={config}
              onSetup={onSetup}
              onChangeModel={onChangeModel}
              onChangeSettings={onChangeSettings}
              onSetKey={onSetKey}
              onFetchModels={onFetchModels}
              fetchedModels={fetchedModels}
              isFetchingModels={isFetchingModels}
            />
          </div>
        </div>

        {/* Conversation or Welcome */}
        {hasContent ? (
          <div className="desktop-conversation">
            <div className="desktop-conversation-inner">
              <MessageList
                messages={messages}
                streamingText={streamingText}
                isStreaming={isStreaming}
                bubbleVariant="flat"
              />
            </div>
          </div>
        ) : (
          <div className="desktop-welcome">
            <div className="desktop-welcome-icon">&#129302;</div>
            <h3>AI Coding Agent</h3>
            <p>
              Ready. Send a message below or select code in the editor and use Ctrl+Shift+P commands.
            </p>
          </div>
        )}

        {/* Input */}
        <div className="desktop-input-area">
          <div className="desktop-input-inner">
            <ChatInput onSend={onSend} onCancel={onCancel} isStreaming={isStreaming} />
          </div>
        </div>
      </div>
    </div>
  );
};
