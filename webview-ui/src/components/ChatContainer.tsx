import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ContextIndicator } from './ContextIndicator';
import { ModelSelector } from './ModelSelector';
import { SessionSelector } from './SessionSelector';
import type { ChatMessage, ConfigState } from '../state/chat-store';

interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

interface ChatContainerProps {
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
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
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
}) => {
  const hasContent = messages.length > 0 || streamingText;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid var(--bytepilot-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <SessionSelector
          sessions={sessions}
          activeId={activeSessionId}
          onSwitch={onSwitchSession}
          onNew={onNewSession}
          onDelete={onDeleteSession}
        />
        <ModelSelector config={config} onSetup={onSetup} onChangeModel={onChangeModel} onChangeSettings={onChangeSettings} onSetKey={onSetKey} onFetchModels={onFetchModels} fetchedModels={fetchedModels} isFetchingModels={isFetchingModels} />
      </div>

      {/* Context bar */}
      <ContextIndicator
        openFiles={contextInfo.openFiles}
        projectFiles={contextInfo.projectFiles}
        diagnosticsCount={contextInfo.diagnosticsCount}
        hasRules={contextInfo.hasRules}
      />

      {/* Messages or Welcome/Setup */}
      {hasContent ? (
        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '20px', color: 'var(--bytepilot-fg-secondary)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>&#129302;</div>
          <h3 style={{ marginBottom: '8px', fontWeight: 500 }}>AI Coding Agent</h3>
          <p style={{ fontSize: '12px', maxWidth: '280px', lineHeight: 1.5 }}>
            Ready. Send a message below or select code in the editor and use Ctrl+Shift+P commands.
          </p>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={onSend} onCancel={onCancel} isStreaming={isStreaming} />
    </div>
  );
};
