import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVSCode } from '../hooks/useVSCode';

interface ChatInputProps { onSend: (content: string) => void; onCancel: () => void; isStreaming: boolean; }
interface FileEntry { path: string; name: string; }

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, onCancel, isStreaming }) => {
  const { postMessage } = useVSCode();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // @file autocomplete
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionFiles, setMentionFiles] = useState<FileEntry[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<FileEntry[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Listen for file search results
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'files.searchResult') {
        setMentionFiles((e.data.payload?.files || []) as FileEntry[]);
        setMentionIndex(0);
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!mentionActive) return;
    const h = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setMentionActive(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mentionActive]);

  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; }
  }, [input]);

  const detectMention = useCallback((text: string, cursorPos: number) => {
    const before = text.substring(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1 || (atIdx > 0 && before[atIdx - 1] !== ' ' && before[atIdx - 1] !== '\n')) {
      setMentionActive(false); setMentionQuery(''); return;
    }
    const q = before.substring(atIdx + 1);
    if (q.includes(' ')) { setMentionActive(false); setMentionQuery(''); return; }
    setMentionActive(true); setMentionQuery(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => postMessage({ type: 'files.search', payload: { query: q } } as any), 150);
  }, [postMessage]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    detectMention(e.target.value, e.target.selectionStart);
  }, [detectMention]);

  const insertMention = useCallback((f: FileEntry) => {
    const before = input.substring(0, textareaRef.current?.selectionStart ?? input.length);
    const after = input.substring(textareaRef.current?.selectionStart ?? input.length);
    const atIdx = before.lastIndexOf('@');
    setInput(before.substring(0, atIdx) + '@' + f.path + ' ' + after);
    setMentionActive(false); setMentionQuery('');
    setSelectedFiles(prev => prev.some(x => x.path === f.path) ? prev : [...prev, f]);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input]);

  const removeSelectedFile = useCallback((f: FileEntry) => {
    setSelectedFiles(prev => prev.filter(x => x.path !== f.path));
    setInput(prev => prev.replace(new RegExp('@' + f.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s?', 'g'), '').trim());
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mentionActive && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionFiles.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionFiles[mentionIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionActive(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape' && isStreaming) onCancel();
  }, [mentionActive, mentionFiles, mentionIndex, insertMention, isStreaming, onCancel]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput(''); setSelectedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, isStreaming, onSend]);

  return (
    <div className="chat-input-container" style={{ position: 'relative' }}>
      {selectedFiles.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', padding: '2px 0', flexWrap: 'wrap' }}>
          {selectedFiles.map(f => (
            <span key={f.path} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
              @{f.path}
              <span onClick={() => removeSelectedFile(f)} style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}
      {mentionActive && (
        <div ref={dropdownRef} style={{ position: 'absolute', bottom: '100%', left: '8px', maxHeight: '200px', overflow: 'auto', background: 'var(--vscode-dropdown-background)', border: '1px solid var(--vscode-dropdown-border)', borderRadius: '4px', zIndex: 100, minWidth: '200px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
          {mentionFiles.length === 0 ? (
            <div style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>{mentionQuery ? 'No matching files' : 'Type to search files...'}</div>
          ) : mentionFiles.map((f, i) => (
            <div key={f.path} onClick={() => insertMention(f)} onMouseEnter={() => setMentionIndex(i)}
              style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer', background: i === mentionIndex ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent', color: i === mentionIndex ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{f.name}</span><span style={{ opacity: 0.5, fontSize: '11px' }}>{f.path}</span>
            </div>
          ))}
        </div>
      )}
      <div className="chat-input-wrapper">
        <textarea ref={textareaRef} className="chat-input" value={input} onChange={handleChange} onKeyDown={handleKeyDown} onSelect={(e) => detectMention(input, (e.target as HTMLTextAreaElement).selectionStart)}
          placeholder={isStreaming ? 'AI is responding...' : 'Ask anything... Use @file to reference files'} rows={1} disabled={isStreaming} />
        {isStreaming ? (
          <button className="chat-send-btn" onClick={onCancel} style={{ background: 'var(--vscode-button-secondaryBackground)' }}>Stop</button>
        ) : (
          <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>Send</button>
        )}
      </div>
    </div>
  );
};
