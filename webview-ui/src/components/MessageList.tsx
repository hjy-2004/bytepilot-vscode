import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../state/chat-store';

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingText,
  isStreaming,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Streaming provisional bubble */}
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

      {/* Thinking indicator when waiting for first token */}
      {isStreaming && !streamingText && (
        <div style={{
          padding: '12px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <span className="thinking-dot" style={{ animationDelay: '0s' }} />
            <span className="thinking-dot" style={{ animationDelay: '0.2s' }} />
            <span className="thinking-dot" style={{ animationDelay: '0.4s' }} />
          </div>
          <span style={{
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            opacity: 0.8,
          }}>
            Thinking...
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
