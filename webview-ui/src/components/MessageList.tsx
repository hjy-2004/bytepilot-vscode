import React, { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../state/chat-store';

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
}

/** Animated status indicator shown while the AI is working */
const WorkingIndicator: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      animation: 'fadeIn 0.3s ease-in',
    }}>
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        <span className="thinking-dot" style={{ animationDelay: '0s', width: '8px', height: '8px' }} />
        <span className="thinking-dot" style={{ animationDelay: '0.2s', width: '8px', height: '8px' }} />
        <span className="thinking-dot" style={{ animationDelay: '0.4s', width: '8px', height: '8px' }} />
      </div>
      <span style={{
        fontSize: '12px',
        color: 'var(--bytepilot-fg-secondary)',
        fontWeight: 400,
      }}>
        {text}
      </span>
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = React.memo(({
  messages,
  streamingText,
  isStreaming,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Find pending approval card to scroll to
  const pendingMsgId = messages.find(m =>
    m.toolCalls?.some(tc => tc.status === 'pending_approval')
  )?.id;

  useEffect(() => {
    if (pendingMsgId) {
      const el = document.getElementById(`msg-${pendingMsgId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, pendingMsgId]);

  // Determine what status to show during streaming
  const runningTools = messages.flatMap(m => m.toolCalls || []).filter(tc => tc.status === 'running');
  const hasPendingApproval = messages.some(m => m.toolCalls?.some(tc => tc.status === 'pending_approval'));
  const hasRunningTools = runningTools.length > 0;

  let statusText = 'Thinking...';
  if (hasPendingApproval) {
    statusText = 'Waiting for your approval...';
  } else if (hasRunningTools) {
    const toolName = runningTools[0].displayName;
    statusText = runningTools.length > 1
      ? `Running ${runningTools.length} tools...`
      : `Running: ${toolName}...`;
  } else if (streamingText.length > 0) {
    statusText = ''; // Streaming text is shown instead
  }

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} id={`msg-${msg.id}`}>
          <MessageBubble message={msg} />
        </div>
      ))}

      {/* Streaming text bubble */}
      {isStreaming && streamingText && (
        <MessageBubble
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingText,
            timestamp: Date.now(),
          }}
          isStreaming
        />
      )}

      {/* Status indicator: show when streaming but no text, or when tools are executing */}
      {isStreaming && statusText && !streamingText && (
        <WorkingIndicator text={statusText} />
      )}

      {/* Show status even during streaming text if there are running tools */}
      {isStreaming && statusText && streamingText && hasRunningTools && (
        <WorkingIndicator text={statusText} />
      )}

      <div ref={bottomRef} />
    </div>
  );
});
