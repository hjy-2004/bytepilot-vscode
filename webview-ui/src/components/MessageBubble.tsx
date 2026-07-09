import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage } from '../state/chat-store';

/** Box-drawing tree chars: ├ └ │ ─ ┬ etc. AI uses these for directory trees. */
const TREE_CHAR_RE = /[\u2500-\u257F]/;

/**
 * Split same-line tree entries.
 * AI sometimes outputs "dir/ ├── sub/ └── file" all on one line.
 */
function splitSameLineTreeChars(content: string): string {
  // Only split when visible non-tree text is followed by inline space then a
  // tree char. "+" quantifier captures the full preceding word (e.g. "dir/").
  // Excludes tree chars, all whitespace, and newlines from the first group so
  // structural indentation like "│   ├── file" is preserved.
  content = content.replace(/([^├└│\s\n]+)[^\S\n]+([├└])/g, '$1\n$2');
  content = content.replace(/([^├└│\s\n]+)[^\S\n]+(│)/g, '$1\n$2');
  return content;
}

/**
 * Wrap consecutive tree-character lines in a single ``` fence.
 * This keeps the tree as one block so alignment is preserved even when
 * the AI inserts blank lines between entries.
 * Only detects Unicode box-drawing chars — no ASCII heuristics.
 */
function wrapTreeLinesInFence(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let treeLines: string[] = [];

  function flush() {
    if (treeLines.length === 0) return;
    // Filter out lines that are ONLY tree connectors with no real content
    // (e.g. "│ " on its own line — these are spacing artifacts, not actual entries)
    const meaningful = treeLines.filter(l => !/^[\s│├└┬┴┼─]*$/.test(l));
    if (meaningful.length > 0) {
      result.push('```');
      result.push(...treeLines);
      result.push('```');
    } else {
      result.push(...treeLines);
    }
    treeLines = [];
  }

  for (const line of lines) {
    if (TREE_CHAR_RE.test(line) && !line.trim().startsWith('```')) {
      treeLines.push(line);
    } else {
      flush();
      result.push(line);
    }
  }
  flush();
  return result.join('\n');
}

function preprocessContent(content: string): string {
  return wrapTreeLinesInFence(splitSameLineTreeChars(content));
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
              children={preprocessContent(message.content)}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  if (match) {
                    return <CodeBlock language={match[1]} code={codeStr} />;
                  }
                  // Multiline code without language tag — render as code block
                  if (codeStr.includes('\n')) {
                    return <CodeBlock language="text" code={codeStr} />;
                  }
                  return (
                    <code
                      style={{
                        background: 'var(--bytepilot-code-bg)',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        fontSize: '12px',
                        fontFamily: 'var(--bytepilot-editor-font-family, monospace)',
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
                // Render tree lines as monospace <pre> blocks
                p({ children }) {
                  const text = Array.isArray(children)
                    ? children.map(c => (typeof c === 'string' ? c : '')).join('')
                    : String(children ?? '');
                  if (TREE_CHAR_RE.test(text)) {
                    return (
                      <pre style={{
                        fontFamily: 'var(--bytepilot-editor-font-family, monospace)',
                        fontSize: '12px',
                        lineHeight: 1.5,
                        margin: '2px 0',
                        padding: '4px 0',
                        whiteSpace: 'pre',
                        overflowX: 'auto',
                        background: 'transparent',
                        border: 'none',
                      }}>
                        {children}
                      </pre>
                    );
                  }
                  return <p>{children}</p>;
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
