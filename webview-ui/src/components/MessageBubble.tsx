import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage } from '../state/chat-store';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isStreaming }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      padding: '4px 0',
    }}>
      <div style={{
        maxWidth: '95%',
        padding: '8px 12px',
        borderRadius: '8px',
        background: isUser
          ? 'var(--vscode-button-background)'
          : isSystem
            ? 'var(--vscode-inputValidation-errorBackground)'
            : 'var(--vscode-editor-background)',
        color: isUser
          ? 'var(--vscode-button-foreground)'
          : isSystem
            ? 'var(--vscode-inputValidation-errorForeground)'
            : 'var(--vscode-foreground)',
        border: isUser ? 'none' : '1px solid var(--vscode-panel-border)',
        fontSize: '13px',
      }}>
        {/* Role label */}
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
                        background: 'var(--vscode-textCodeBlock-background)',
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
                      style={{ color: 'var(--vscode-textLink-foreground)' }}
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
                background: 'var(--vscode-foreground)',
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
