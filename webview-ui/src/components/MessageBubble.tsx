import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage } from '../state/chat-store';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  /** 'card' = VS Code style (background+border), 'flat' = desktop style (plain text flow) */
  variant?: 'card' | 'flat';
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isStreaming, variant = 'card' }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const isFlat = variant === 'flat';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      padding: isFlat ? '12px 0' : '4px 0',
    }}>
      <div style={{
        maxWidth: isFlat ? '100%' : '95%',
        padding: isFlat
          ? (isUser ? '6px 14px' : '0')
          : '8px 12px',
        borderRadius: isFlat ? (isUser ? '18px' : '0') : '8px',
        background: isFlat
          ? (isUser ? 'var(--bytepilot-btn-bg)' : 'transparent')
          : isUser
            ? 'var(--bytepilot-btn-bg)'
            : isSystem
              ? 'var(--bytepilot-error-bg)'
              : 'var(--bytepilot-bg-secondary)',
        color: isFlat
          ? (isUser ? 'var(--bytepilot-btn-fg)' : 'var(--bytepilot-fg-primary)')
          : isUser
            ? 'var(--bytepilot-btn-fg)'
            : isSystem
              ? 'var(--bytepilot-error-fg)'
              : 'var(--bytepilot-fg-primary)',
        border: isFlat
          ? 'none'
          : isUser ? 'none' : '1px solid var(--bytepilot-border)',
        fontSize: '13px',
      }}>
        {/* Role label — hidden in flat mode */}
        {!isFlat && (
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '4px',
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {isUser ? 'You' : isSystem ? 'System' : 'Assistant'}
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls?.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} />
        ))}

        {/* Markdown content */}
        {message.content && (
          <div className="markdown-body" style={{
            wordBreak: 'break-word',
            lineHeight: 1.6,
          }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  if (match) {
                    return <CodeBlock language={match[1]} code={codeStr} />;
                  }
                  return (
                    <code
                      style={{
                        background: 'var(--bytepilot-code-bg)',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        fontSize: '12px',
                      }}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      style={{ color: 'var(--bytepilot-link-fg)' }}
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) {
                          // Open in external browser - handled by VS Code
                        }
                      }}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '14px',
                background: 'var(--bytepilot-fg-primary)',
                marginLeft: '1px',
                animation: 'blink 1s step-end infinite',
                verticalAlign: 'text-bottom',
              }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
});
