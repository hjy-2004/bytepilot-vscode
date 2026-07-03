import React, { useCallback, useRef, useMemo } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
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

/** Footer component rendered below the list during streaming */
const StreamingFooter: React.FC<{
  streamingText: string;
  isStreaming: boolean;
  statusText: string;
}> = React.memo(({ streamingText, isStreaming, statusText }) => {
  if (!isStreaming) return null;

  return (
    <div style={{ paddingBottom: '4px' }}>
      {streamingText && (
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
      {statusText && !streamingText && (
        <WorkingIndicator text={statusText} />
      )}
      {statusText && streamingText && (
        <WorkingIndicator text={statusText} />
      )}
    </div>
  );
});

export const MessageList: React.FC<MessageListProps> = React.memo(({
  messages,
  streamingText,
  isStreaming,
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Find pending approval card to scroll to
  const pendingMsgIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].toolCalls?.some(tc => tc.status === 'pending_approval')) {
        return i;
      }
    }
    return -1;
  }, [messages]);

  // Determine what status to show during streaming
  const runningTools = useMemo(
    () => messages.flatMap(m => m.toolCalls || []).filter(tc => tc.status === 'running'),
    [messages],
  );
  const hasPendingApproval = useMemo(
    () => messages.some(m => m.toolCalls?.some(tc => tc.status === 'pending_approval')),
    [messages],
  );
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
    statusText = '';
  }

  // Scroll to pending approval when it appears
  React.useEffect(() => {
    if (pendingMsgIndex >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: pendingMsgIndex,
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [pendingMsgIndex]);

  // Auto-follow new content only when user is at the bottom
  // If there's a pending approval, don't auto-follow (stay on the approval card)
  const followOutput = useCallback(
    (isAtBottom: boolean) => {
      if (pendingMsgIndex >= 0) return false;
      return isAtBottom;
    },
    [pendingMsgIndex],
  );

  const itemContent = useCallback(
    (_index: number, msg: ChatMessage) => (
      <MessageBubble message={msg} />
    ),
    [],
  );

  // Footer component with streaming content
  const Footer = useCallback(() => (
    <StreamingFooter
      streamingText={streamingText}
      isStreaming={isStreaming}
      statusText={statusText}
    />
  ), [streamingText, isStreaming, statusText]);

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={messages}
      itemContent={itemContent}
      followOutput={followOutput}
      atBottomThreshold={80}
      components={{ Footer }}
      style={{ flex: 1 }}
      increaseViewportBy={{ top: 200, bottom: 200 }}
    />
  );
});
