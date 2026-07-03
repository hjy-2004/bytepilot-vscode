import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePlatform } from '../hooks/usePlatform';
import { useChatStore } from '../state/chat-store';

interface ChatInputProps {
  onSend: (content: string, attachments?: Array<{ name: string; content: string; type: 'image'; mimeType: string }>) => void;
  onCancel: () => void;
  isStreaming: boolean;
}
interface FileEntry { path: string; name: string; }
interface ImageAttachment { name: string; content: string; type: 'image'; mimeType: string; }

const SLASH_COMMANDS = [
  { cmd: '/clear', description: 'Clear conversation' },
  { cmd: '/config', description: 'Show current configuration' },
  { cmd: '/sessions', description: 'List saved sessions' },
  { cmd: '/rules', description: 'Edit .bytepilotrules' },
  { cmd: '/help', description: 'Show all commands' },
];

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, onCancel, isStreaming }) => {
  const { postMessage } = usePlatform();
  const [input, setInput] = useState('');
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // @file autocomplete
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionFiles, setMentionFiles] = useState<FileEntry[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<FileEntry[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Slash commands
  const [slashActive, setSlashActive] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  // Input history
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyDraft = useRef<string>('');

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
    // Detect slash command: must be at start of input or start of a line
    if (before.startsWith('/') && !before.includes(' ') && cursorPos <= before.length) {
      const q = before.substring(1);
      setSlashActive(true);
      setMentionActive(false);
      const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith('/' + q));
      if (filtered.length > 0 && q.length > 0) {
        setMentionFiles(filtered.map(c => ({ path: c.cmd, name: c.description })));
      } else {
        setMentionFiles(SLASH_COMMANDS.map(c => ({ path: c.cmd, name: c.description })));
      }
      setMentionQuery(q);
      setSlashIndex(0);
      return;
    }
    setSlashActive(false);
    // @file autocomplete
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
    setHistoryIndex(-1);
    detectMention(e.target.value, e.target.selectionStart);
  }, [detectMention]);

  // Execute slash command
  const executeSlashCommand = useCallback((cmd: string) => {
    switch (cmd) {
      case '/clear':
        useChatStore.getState().clearMessages();
        postMessage({ type: 'chat.clear' } as any);
        break;
      case '/config':
        postMessage({ type: 'config.get' } as any);
        break;
      case '/sessions':
        postMessage({ type: 'session.list' } as any);
        break;
      case '/rules':
        postMessage({ type: 'context.refresh' } as any);
        break;
      case '/help':
        setInput('/clear — Clear conversation\n/config — Show configuration\n/sessions — List sessions\n/rules — Refresh project rules\n/help — Show this help');
        return;
    }
    setInput('');
    setMentionActive(false);
    setSlashActive(false);
  }, [postMessage]);

  // Image paste handler
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setImageAttachments((prev) => [
            ...prev,
            { name: `image_${Date.now()}.${item.type.split('/')[1] || 'png'}`, content: dataUrl, type: 'image' as const, mimeType: item.type },
          ]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const removeImage = useCallback((idx: number) => {
    setImageAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Local file upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setImageAttachments((prev) => [
          ...prev,
          { name: file.name, content: reader.result as string, type: 'image' as const, mimeType: file.type },
        ]);
      };
      reader.readAsDataURL(file);
    }
    // Reset so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

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
    // Slash command dropdown navigation
    if (slashActive && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, mentionFiles.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); executeSlashCommand(mentionFiles[slashIndex].path); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashActive(false); setMentionFiles([]); return; }
    }
    // @file mention dropdown navigation
    if (mentionActive && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionFiles.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionFiles[mentionIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionActive(false); return; }
    }
    // Input history navigation (only when input is empty or at beginning of history)
    if (e.key === 'ArrowUp' && !input.trim()) {
      e.preventDefault();
      const history = useChatStore.getState().inputHistory;
      if (history.length === 0) return;
      if (historyIndex === -1) {
        historyDraft.current = input;
        const newIdx = history.length - 1;
        setHistoryIndex(newIdx);
        setInput(history[newIdx]);
      } else if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInput(history[newIdx]);
      }
      return;
    }
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const history = useChatStore.getState().inputHistory;
      if (historyIndex < history.length - 1) {
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        setInput(history[newIdx]);
      } else {
        setHistoryIndex(-1);
        setInput(historyDraft.current);
        historyDraft.current = '';
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape' && isStreaming) onCancel();
  }, [mentionActive, mentionFiles, mentionIndex, slashActive, slashIndex, historyIndex, input, insertMention, isStreaming, onCancel, executeSlashCommand]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && imageAttachments.length === 0) || isStreaming) return;
    useChatStore.getState().addToInputHistory(trimmed);
    onSend(trimmed, imageAttachments.length > 0 ? imageAttachments : undefined);
    setInput(''); setSelectedFiles([]); setImageAttachments([]); setHistoryIndex(-1);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, imageAttachments, isStreaming, onSend]);

  return (
    <div className="chat-input-container" style={{ position: 'relative' }}>
      {selectedFiles.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', padding: '2px 0', flexWrap: 'wrap' }}>
          {selectedFiles.map(f => (
            <span key={f.path} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: 'var(--bytepilot-badge-bg)', color: 'var(--bytepilot-badge-fg)' }}>
              @{f.path}
              <span onClick={() => removeSelectedFile(f)} style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}
      {/* Image previews */}
      {imageAttachments.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', padding: '4px 0', flexWrap: 'wrap' }}>
          {imageAttachments.map((img, idx) => (
            <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--bytepilot-border)' }}>
              <img src={img.content} alt="pasted" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span onClick={() => removeImage(idx)} style={{ position: 'absolute', top: '1px', right: '3px', cursor: 'pointer', color: 'var(--bytepilot-image-overlay-fg)', background: 'var(--bytepilot-image-overlay-bg)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', lineHeight: 1 }}>×</span>
            </div>
          ))}
        </div>
      )}
      {(mentionActive || slashActive) && (
        <div ref={dropdownRef} style={{ position: 'absolute', bottom: '100%', left: '8px', maxHeight: '200px', overflow: 'auto', background: 'var(--bytepilot-dropdown-bg)', border: '1px solid var(--bytepilot-dropdown-border)', borderRadius: '4px', zIndex: 100, minWidth: '200px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
          {mentionFiles.length === 0 ? (
            <div style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--bytepilot-fg-secondary)' }}>{mentionQuery ? 'No matching files' : 'Type to search files...'}</div>
          ) : mentionFiles.map((f, i) => (
            <div key={f.path} onClick={() => slashActive ? executeSlashCommand(f.path) : insertMention(f)} onMouseEnter={() => slashActive ? setSlashIndex(i) : setMentionIndex(i)}
              style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer', background: i === (slashActive ? slashIndex : mentionIndex) ? 'var(--bytepilot-list-active-bg)' : 'transparent', color: i === (slashActive ? slashIndex : mentionIndex) ? 'var(--bytepilot-list-active-fg)' : 'var(--bytepilot-fg-primary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{slashActive ? f.path : f.name}</span><span style={{ opacity: 0.5, fontSize: '11px' }}>{slashActive ? f.name : f.path}</span>
            </div>
          ))}
        </div>
      )}
      <div className="chat-input-wrapper">
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload}
          style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} title="Upload image"
          disabled={isStreaming}
          style={{
            background: 'transparent', border: 'none', cursor: isStreaming ? 'default' : 'pointer',
            color: 'var(--bytepilot-fg-secondary)', padding: '0 4px 0 6px',
            opacity: isStreaming ? 0.4 : 0.7, flexShrink: 0, display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
            <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none"/>
            <path d="M1.5 12l3-3 3 3 2.5-2.5L14.5 13" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <textarea ref={textareaRef} className="chat-input" value={input} onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
          onSelect={(e) => detectMention(input, (e.target as HTMLTextAreaElement).selectionStart)}
          placeholder={isStreaming ? 'AI is responding...' : 'Ask anything... Use @file to reference files, paste images'} rows={1} disabled={isStreaming} />
        {isStreaming ? (
          <button className="chat-send-btn" onClick={onCancel} style={{ background: 'var(--bytepilot-btn-secondary-bg)' }}>Stop</button>
        ) : (
          <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim() && imageAttachments.length === 0}>Send</button>
        )}
      </div>
    </div>
  );
};
