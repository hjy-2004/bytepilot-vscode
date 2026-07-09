import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';
import type { Message } from '../ai/message-types';
import { logInfo, logError } from '../platform/logger';
import type { UnifiedDiff } from '../types/diff';
import { sanitizePath } from '../utils/paths';

/**
 * Session persistence following Claude Code's pattern:
 * - Sessions stored as .jsonl files in ~/.bytepilot/projects/<sanitized-path>/
 * - Human-readable directory names via sanitizePath (non-alnum → hyphens)
 * - UUID-style session IDs
 * - Cross-project session discovery via listAllSessions()
 */

const BASE_DIR = path.join(os.homedir(), '.bytepilot', 'projects');
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
  /** The sanitized project path this session belongs to */
  projectPath?: string;
}

interface HistoryEntry {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | unknown[];
  timestamp: number;
}

// ============================================================
// Path helpers
// ============================================================

/** Legacy SHA-256 hash for backward compatibility with existing session dirs */
function sha256Hash(p: string): string {
  return crypto.createHash('sha256').update(p).digest('hex').substring(0, 12);
}

/** Legacy hashCode for backward compatibility */
function legacyHash(p: string): string {
  let hash = 0;
  for (let i = 0; i < p.length; i++) {
    hash = ((hash << 5) - hash) + p.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getAllLegacyDirNames(workspacePath: string): string[] {
  return [sha256Hash(workspacePath), legacyHash(workspacePath)];
}

/**
 * Get the project directory for a workspace path.
 *
 * Resolution order:
 *   1. Human-readable sanitized name (new default)
 *   2. Existing SHA-256 hash dir (backward compat, auto-migrates)
 *   3. Existing legacy hashCode dir (backward compat, auto-migrates)
 */
function getProjectDir(workspacePath: string): string {
  const sanitized = sanitizePath(workspacePath);
  const newDir = path.join(BASE_DIR, sanitized);

  // If sanitized dir already exists with content, use it directly
  if (fs.existsSync(newDir)) {
    try {
      const files = fs.readdirSync(newDir).filter(f => f.endsWith('.jsonl'));
      if (files.length > 0) return newDir;
    } catch { /* fall through to migration check */ }
  }

  // Check for legacy hash dirs and migrate
  const legacyNames = getAllLegacyDirNames(workspacePath);
  for (const legacyName of legacyNames) {
    const oldDir = path.join(BASE_DIR, legacyName);
    if (oldDir === newDir) continue;
    if (fs.existsSync(oldDir)) {
      // Remove empty sanitized dir if it exists
      if (fs.existsSync(newDir)) {
        try { fs.rmdirSync(newDir); } catch { /* non-empty, keep it */ }
      }
      try {
        fs.renameSync(oldDir, newDir);
        logInfo(`[session] Migrated project dir: ${legacyName} → ${sanitized}`);
      } catch {
        return oldDir; // rename failed — keep using old dir
      }
      return newDir;
    }
  }

  // Create new directory with sanitized name
  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true, mode: 0o700 });
  }
  return newDir;
}

/** UUID v4-style session ID */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================
// Session listing
// ============================================================

export function listSessions(workspacePath: string): SessionInfo[] {
  if (!workspacePath) return [];
  try {
    const dir = getProjectDir(workspacePath);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    const sessions: SessionInfo[] = [];

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      try {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        const info = readSessionInfo(filePath);
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

/**
 * Scan ALL project directories under ~/.bytepilot/projects/ and collect
 * session metadata. Returns sessions grouped by project path.
 */
export function listAllSessions(): Map<string, SessionInfo[]> {
  const result = new Map<string, SessionInfo[]>();
  try {
    if (!fs.existsSync(BASE_DIR)) return result;
    const projectDirs = fs.readdirSync(BASE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dirent of projectDirs) {
      const projectDir = path.join(BASE_DIR, dirent.name);
      const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      const sessions: SessionInfo[] = [];

      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        try {
          const filePath = path.join(projectDir, file);
          const stat = fs.statSync(filePath);
          const info = readSessionInfo(filePath);
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

      if (sessions.length > 0) {
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        result.set(dirent.name, sessions);
      }
    }
  } catch (err) {
    logError('Failed to list all sessions', err);
  }
  return result;
}

/**
 * Find a session file across all project directories.
 * Returns the file path and project path, or undefined.
 */
export function resolveSessionFilePath(sessionId: string): { filePath: string; projectPath: string } | undefined {
  const fileName = `${sessionId}.jsonl`;
  try {
    if (!fs.existsSync(BASE_DIR)) return undefined;
    const projectDirs = fs.readdirSync(BASE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dirent of projectDirs) {
      const filePath = path.join(BASE_DIR, dirent.name, fileName);
      if (fs.existsSync(filePath)) {
        return { filePath, projectPath: dirent.name };
      }
    }
  } catch { /* scan failed */ }
  return undefined;
}

/** Read lightweight session info from a JSONL file header */
function readSessionInfo(filePath: string): { title: string; count: number } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    let title = '';
    const count = lines.length;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      try {
        const entry = JSON.parse(lines[i]) as HistoryEntry;
        if (entry.role === 'user') {
          const contentStr = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
          title = contentStr.substring(0, 60) + (contentStr.length > 60 ? '...' : '');
          break;
        }
      } catch { /* skip malformed JSON entries */ }
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
  // Lazy creation: don't write the file until the first message.
  // Just ensure the project directory exists.
  getProjectDir(workspacePath);
  logInfo(`Created session: ${id}`);
  return { id, title: `New Chat`, messageCount: 0, createdAt: now, updatedAt: now };
}

/** Ensure the session file exists, creating it if needed (lazy materialization). */
function ensureSessionFile(workspacePath: string, sessionId: string): string {
  const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', { mode: 0o600 });
  }
  return filePath;
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
    const filePath = ensureSessionFile(workspacePath, sessionId);
    const entry: HistoryEntry = { role, content, timestamp: Date.now() };
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', { encoding: 'utf-8', mode: 0o600 });
    logInfo(`Saved ${role} message to session ${sessionId}: "${content.substring(0, 40)}..."`);
    pruneSessionFile(filePath);
  } catch (err) {
    logError('Failed to save message', err);
  }
}

export function loadSessionMessages(workspacePath: string, sessionId: string): Message[] {
  if (!workspacePath) return [];
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: Array<HistoryEntry & { toolCallId?: string; toolCalls?: unknown[] }> = [];
    for (let i = lines.length - 1; i >= 0 && entries.length < MAX_ENTRIES; i--) {
      try {
        const raw = JSON.parse(lines[i]) as { role: string; content: unknown; timestamp?: number; toolCallId?: string; toolCalls?: unknown[] };
        if (raw.role && raw.content != null && raw.role !== '__diff') {
          entries.push({
            role: raw.role as HistoryEntry['role'],
            content: raw.content as HistoryEntry['content'],
            timestamp: raw.timestamp || 0,
            toolCallId: raw.toolCallId,
            toolCalls: raw.toolCalls,
          });
        }
      } catch { /* skip malformed JSON entries */ }
    }
    const withTC = entries.filter((x: any) => x.toolCalls?.length > 0).length;
    const withTCI = entries.filter((x: any) => x.toolCallId).length;
    logInfo(`[loadSessionMessages] Loaded ${entries.length} entries (${withTC} with toolCalls, ${withTCI} with toolCallId) from session ${sessionId}`);
    return entries.reverse().map((e) => {
      const msg: Message = { role: e.role, content: e.content as string };
      if (e.toolCallId) msg.toolCallId = e.toolCallId;
      if (e.toolCalls) msg.toolCalls = e.toolCalls as Message['toolCalls'];
      return msg;
    });
  } catch (err) {
    logError('Failed to load session messages', err);
    return [];
  }
}

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
      } catch { /* skip */ }
    }
    logInfo(`Loaded ${diffs.size} diffs from session ${sessionId}`);
  } catch { /* session read failed */ }
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
  } catch { /* prune failed, non-critical */ }
}

// ============================================================
// Full history save/load
// ============================================================

export function saveFullHistory(
  workspacePath: string,
  sessionId: string,
  messages: Message[],
  toolDiffs?: Map<string, UnifiedDiff>,
): void {
  if (!workspacePath || !sessionId) return;
  try {
    const filePath = path.join(getProjectDir(workspacePath), `${sessionId}.jsonl`);
    const existingDiffs = loadSessionDiffs(workspacePath, sessionId);
    if (toolDiffs) {
      for (const [id, diff] of toolDiffs) existingDiffs.set(id, diff);
    }

    const entries = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content,
        timestamp: Date.now(),
        toolCallId: m.toolCallId,
        toolCalls: m.toolCalls,
      }));

    if (existingDiffs.size > 0) {
      for (const [toolCallId, diff] of existingDiffs) {
        (entries as any[]).push({ role: '__diff', content: { toolCallId, diff }, timestamp: Date.now() });
      }
    }

    const lines = entries.map(e => JSON.stringify(e) + '\n').join('');
    fs.writeFileSync(filePath, lines, { encoding: 'utf-8', mode: 0o600 });
    const withTC = entries.filter((e: any) => e.toolCalls?.length > 0).length;
    const withTCI = entries.filter((e: any) => e.toolCallId).length;
    logInfo(`[saveFullHistory] Saved ${entries.length} entries (${withTC} with toolCalls, ${withTCI} with toolCallId) to session ${sessionId}`);
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

export function appendMessage(
  workspacePath: string,
  sessionId: string,
  msg: Message,
): void {
  if (!workspacePath || !sessionId) return;
  try {
    const filePath = ensureSessionFile(workspacePath, sessionId);
    const entry: HistoryEntry & { toolCallId?: string; toolCalls?: unknown[] } = {
      role: msg.role,
      content: msg.content,
      timestamp: Date.now(),
    };
    if (msg.toolCallId) entry.toolCallId = msg.toolCallId;
    if (msg.toolCalls) entry.toolCalls = msg.toolCalls as unknown[];
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    logError('Failed to append message', err);
  }
}

export function maybePruneHistory(_workspacePath: string): void {
  // Full save replaces the file entirely, no pruning needed
}

export { loadSessionMessages as loadHistory };
