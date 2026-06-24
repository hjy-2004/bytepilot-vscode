import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { CoreMessage } from 'ai';
import { logInfo, logError } from '../utils/logger';
import type { UnifiedDiff } from '../types/diff';

/**
 * Session persistence following Claude Code's pattern:
 * - Sessions stored as individual .jsonl files in ~/.ai-coding-agent/projects/<hash>/
 * - Analogous to ~/.claude/projects/<slug>/<session-id>.jsonl
 */

const BASE_DIR = path.join(os.homedir(), '.ai-coding-agent', 'projects');
const MAX_ENTRIES = 200;

// ============================================================
// Types
// ============================================================

export interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface HistoryEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string | unknown[];
  timestamp: number;
}

// ============================================================
// Path helpers
// ============================================================

function hashPath(p: string): string {
  let hash = 0;
  for (let i = 0; i < p.length; i++) {
    hash = ((hash << 5) - hash) + p.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getProjectDir(workspacePath: string): string {
  const dir = path.join(BASE_DIR, hashPath(workspacePath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// Session listing (scan directory - like Claude Code's fetchLogs)
// ============================================================

export function listSessions(workspacePath: string): SessionInfo[] {
  if (!workspacePath) return [];
  try {
    // Ensure directory exists (even if empty)
    const dir = getProjectDir(workspacePath);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    const sessions: SessionInfo[] = [];

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      try {
        const stat = fs.statSync(path.join(dir, file));
        const info = readSessionInfo(path.join(dir, file));
        sessions.push({
          id: sessionId,
          title: info.title || `Chat ${sessionId.slice(0, 8)}`,
          messageCount: info.count,
          createdAt: stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
        });
      } catch {
        sessions.push({ id: sessionId, title: file, messageCount: 0, createdAt: 0, updatedAt: 0 });
      }
    }
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    logError('Failed to list sessions', err);
    return [];
  }
}

/** Read lightweight session info from a JSONL file header */
function readSessionInfo(filePath: string): { title: string; count: number } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    // First user message is the title
    let title = '';
    let count = lines.length;
    // Check first few lines for a user message (title)
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      try {
        const entry = JSON.parse(lines[i]) as HistoryEntry;
        if (entry.role === 'user') {
          title = entry.content.substring(0, 60) + (entry.content.length > 60 ? '...' : '');
          break;
        }
      } catch {}
    }
    return { title, count };
  } catch {
    return { title: '', count: 0 };
  }
}

// ============================================================
// Session CRUD
// ============================================================

export function createSession(workspacePath: string): SessionInfo {
  const id = generateId();
  const now = Date.now();
  // Create empty session file
  const dir = getProjectDir(workspacePath);
  const filePath = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(filePath, '', { mode: 0o600 });
  logInfo(`Created session: ${id}`);
  return { id, title: `New Chat`, messageCount: 0, createdAt: now, updatedAt: now };
}

export function deleteSession(workspacePath: string, sessionId: string): void {
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    logInfo(`Deleted session: ${sessionId}`);
  } catch (err) {
    logError('Failed to delete session', err);
  }
}

// ============================================================
// Message persistence
// ============================================================

export function saveMessage(
  workspacePath: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): void {
  if (!workspacePath || !sessionId) {
    logError(`saveMessage skipped: ws=${!!workspacePath} sid=${!!sessionId}`);
    return;
  }
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
    const entry: HistoryEntry = { role, content, timestamp: Date.now() };
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', { encoding: 'utf-8', mode: 0o600 });
    logInfo(`Saved ${role} message to session ${sessionId}: "${content.substring(0, 40)}..."`);

    // Occasional prune
    if (Math.random() < 0.03) pruneSessionFile(filePath);
  } catch (err) {
    logError('Failed to save message', err);
  }
}

export function loadSessionMessages(workspacePath: string, sessionId: string): CoreMessage[] {
  if (!workspacePath) return [];
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: HistoryEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && entries.length < MAX_ENTRIES; i--) {
      try {
        const e = JSON.parse(lines[i]) as { role: string; content: unknown; timestamp?: number };
        if (e.role && e.content && e.role !== '__diff') {
          entries.push({ role: e.role as HistoryEntry['role'], content: e.content as HistoryEntry['content'], timestamp: e.timestamp || 0 });
        }
      } catch {}
    }
    logInfo(`Loaded ${entries.length} messages from session ${sessionId}`);
    return entries.reverse().map(e => ({ role: e.role, content: e.content } as CoreMessage));
  } catch (err) {
    logError('Failed to load session messages', err);
    return [];
  }
}

/** Load persisted tool diffs from a session JSONL file. Returns a map of toolCallId -> UnifiedDiff. */
export function loadSessionDiffs(workspacePath: string, sessionId: string): Map<string, UnifiedDiff> {
  const diffs = new Map<string, UnifiedDiff>();
  if (!workspacePath) return diffs;
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return diffs;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]) as { role: string; content: any };
        if (e.role === '__diff' && e.content?.toolCallId && e.content?.diff) {
          diffs.set(e.content.toolCallId, e.content.diff as UnifiedDiff);
        }
      } catch {}
    }
    logInfo(`Loaded ${diffs.size} diffs from session ${sessionId}`);
  } catch {}
  return diffs;
}

function pruneSessionFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length <= MAX_ENTRIES) return;
    const kept = lines.slice(-MAX_ENTRIES);
    fs.writeFileSync(filePath, kept.join('\n') + '\n', { mode: 0o600 });
  } catch {}
}

// ============================================================
// Full history save/load (preserves tool context across sessions)
// ============================================================

export function saveFullHistory(
  workspacePath: string,
  sessionId: string,
  messages: CoreMessage[],
  toolDiffs?: Map<string, UnifiedDiff>,
): void {
  if (!workspacePath || !sessionId) return;
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);

    // Load existing diffs so they survive across writes (each response overwrites the file)
    const existingDiffs = loadSessionDiffs(workspacePath, sessionId);
    if (toolDiffs) {
      for (const [id, diff] of toolDiffs) {
        existingDiffs.set(id, diff);
      }
    }

    const entries = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content,
        timestamp: Date.now(),
      }));

    // Append all diffs as __diff entries (for UI restore, not sent to AI)
    if (existingDiffs.size > 0) {
      for (const [toolCallId, diff] of existingDiffs) {
        entries.push({ role: '__diff', content: { toolCallId, diff }, timestamp: Date.now() });
      }
    }

    const lines = entries.map(e => JSON.stringify(e) + '\n').join('');
    fs.writeFileSync(filePath, lines, { encoding: 'utf-8', mode: 0o600 });
    logInfo(`Saved ${entries.length} messages to session ${sessionId}`);
  } catch (err) {
    logError('Failed to save full history', err);
  }
}

export function saveUserMessage(workspacePath: string, sessionId: string, content: string): void {
  saveMessage(workspacePath, sessionId, 'user', content);
}

export function saveAssistantMessage(workspacePath: string, sessionId: string, content: string): void {
  saveMessage(workspacePath, sessionId, 'assistant', content);
}

export function maybePruneHistory(_workspacePath: string): void {
  // Full save replaces the file entirely, no pruning needed
}

// Legacy alias
export { loadSessionMessages as loadHistory };
