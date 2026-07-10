import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ContextIndicator } from './ContextIndicator';
import { ModelSelector } from './ModelSelector';
import type { ChatMessage, ConfigState, UpdateInfo } from '../state/chat-store';

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
  updateInfo: UpdateInfo | null;
  onDismissUpdate: () => void;
  downloadingUpdate: boolean;
  downloadProgress: number;
  onDownloadUpdate: () => void;
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
  onOpenSettings?: () => void;
}

export const ChatContainerDesktop: React.FC<ChatContainerDesktopProps> = ({
  messages,
  streamingText,
  isStreaming,
  contextInfo,
  config,
  updateInfo,
  onDismissUpdate,
  downloadingUpdate,
  downloadProgress,
  onDownloadUpdate,
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
  onOpenSettings,
}) => {
  const hasContent = messages.length > 0 || streamingText;

  return (
    <div className="desktop-layout">
      {/* ── Left sidebar ─────────────────────────── */}
      <div className="desktop-sidebar">
        <div className="desktop-sidebar-header">
          <span className="desktop-sidebar-title">BytePilot</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="desktop-sidebar-settings-btn" onClick={onOpenSettings} title="Settings">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="8" cy="8" r="2.5"/>
                <path d="M8 1.5v1.5M8 13v1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M1.5 8H3M13 8h1.5M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" strokeLinecap="round"/>
              </svg>
            </button>
            <button className="desktop-sidebar-new-btn" onClick={onNewSession}>
              + New
            </button>
          </div>
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

        {/* Update available banner */}
        {updateInfo && (() => {
          const status = updateInfo.status;
          const isInstalled = status === 'installed';
          const isError = status === 'error';
          const isDownloading = status === 'downloading' || downloadingUpdate;
          const bg = isInstalled ? 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
            : isError ? 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)'
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          return (
          <div style={{
            background: bg,
            color: '#fff',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '13px',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              {isInstalled ? (
                <>&#10003; Update <strong>v{updateInfo.version}</strong> installed. <strong>Please restart</strong> to apply.</>
              ) : isError ? (
                <>&#10007; Update failed{updateInfo.errorMessage ? `: ${updateInfo.errorMessage}` : ''}.</>
              ) : (
                <>&#128640; Update available: <strong>v{updateInfo.version}</strong>
                {updateInfo.currentVersion && <> (current: v{updateInfo.currentVersion})</>}
                .</>
              )}
            </span>
            <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              {isDownloading ? (
                <>
                  <div style={{
                    width: '120px',
                    height: '6px',
                    background: 'rgba(255,255,255,0.3)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: downloadProgress >= 0 ? `${downloadProgress}%` : '30%',
                      height: '100%',
                      background: '#fff',
                      borderRadius: '3px',
                      transition: 'width 0.3s',
                      ...(downloadProgress < 0 ? {
                        animation: 'bytepilot-progress-indeterminate 1.5s ease-in-out infinite',
                        width: '40%',
                      } : {}),
                    }} />
                  </div>
                  <span style={{ fontSize: '12px', minWidth: '36px' }}>{downloadProgress >= 0 ? `${downloadProgress}%` : '...'}</span>
                  <style>{`@keyframes bytepilot-progress-indeterminate{0%{margin-left:-40%}100%{margin-left:100%}}`}</style>
                </>
              ) : !isInstalled && !isError ? (
                <button
                  onClick={onDownloadUpdate}
                  style={{
                    background: 'rgba(255,255,255,0.25)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    color: '#fff',
                    padding: '4px 14px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Download &amp; Install
                </button>
              ) : null}
              <button
                onClick={onDismissUpdate}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.7)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                }}
                title="Dismiss"
              >
                &times;
              </button>
            </span>
          </div>
        )})()}

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
