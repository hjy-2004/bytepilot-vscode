import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage } from '../state/chat-store';

/** Detect directory tree structures and wrap them in markdown code blocks. */
function preprocessTreeBlocks(content: string): string {
  // Step 1: Split tree entries that are on the same line
  // AI sometimes outputs: "├── a └── b" (one line, no newlines between entries)
  // Normalize to: "├── a\n└── b"
  const treeConnector = /(\S)\s{2,}([├└])/g;
  content = content.replace(treeConnector, '$1\n$2');

  // Step 2: Detect lines with box-drawing chars and wrap in code fences
  const lines = content.split('\n');
  const result: string[] = [];
  let inTree = false;
  let treeLines: string[] = [];
  const treeChars = /[\u2500-\u257F]/;

  for (const line of lines) {
    const isTreeLine = treeChars.test(line);
    if (isTreeLine && !line.trim().startsWith('```')) {
      if (!inTree) {
        inTree = true;
        treeLines = [];
      }
      treeLines.push(line);
    } else {
      if (inTree) {
        if (treeLines.length > 0) {
          result.push('```');
          result.push(...treeLines);
          result.push('```');
        }
        inTree = false;
        treeLines = [];
      }
      result.push(line);
    }
  }
  if (inTree && treeLines.length > 0) {
    result.push('```');
    result.push(...treeLines);
    result.push('```');
  }

  return result.join('\n');
}

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
              children={preprocessTreeBlocks(message.content)}
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
            />
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
