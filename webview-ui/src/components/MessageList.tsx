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

      {/* Loading indicator when waiting for first token */}
      {isStreaming && !streamingText && (
        <div style={{ padding: '4px 0', display: 'flex', gap: '4px' }}>
          <span className="dot-pulse" style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--vscode-descriptionForeground)',
            animation: 'pulse 1.4s infinite ease-in-out',
          }} />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
