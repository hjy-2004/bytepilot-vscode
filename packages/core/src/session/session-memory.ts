import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { sanitizePath } from '../utils/paths';

/** Shared base dir for all project data */
function getProjectDir(workspacePath: string): string {
  const baseDir = path.join(os.homedir(), '.bytepilot', 'projects');
  return path.join(baseDir, sanitizePath(workspacePath));
}

/**
 * Per-session memory following Claude Code's SessionMemory/prompts.ts pattern.
 *
 * Each session gets a session-memory/summary.md file for tracking:
 *   - Current state and task specification
 *   - Files and functions being worked on
 *   - Errors, corrections, and learnings
 *   - Key results and worklog
 *
 * The file is scoped to the session directory:
 *   ~/.bytepilot/projects/<sanitized>/<sessionId>/session-memory/summary.md
 */

const SESSION_MEMORY_DIR = 'session-memory';
const SUMMARY_FILE = 'summary.md';

export interface SessionSummary {
  /** Session title */
  title?: string;
  /** Current state description */
  currentState?: string;
  /** Task being worked on */
  task?: string;
  /** Key files involved */
  files?: string[];
  /** Errors encountered and fixes */
  errors?: string[];
  /** Learnings from this session */
  learnings?: string[];
  /** Key results achieved */
  results?: string[];
  /** Raw markdown content */
  rawContent?: string;
}

function getSessionDir(workspacePath: string, sessionId: string): string {
  const dir = path.join(getProjectDir(workspacePath), sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function getSummaryPath(workspacePath: string, sessionId: string): string {
  const memDir = path.join(getSessionDir(workspacePath, sessionId), SESSION_MEMORY_DIR);
  if (!fs.existsSync(memDir)) {
    fs.mkdirSync(memDir, { recursive: true, mode: 0o700 });
  }
  return path.join(memDir, SUMMARY_FILE);
}

/**
 * Parse a summary.md file into a SessionSummary object.
 * Extracts markdown sections: ## Title, ## Current State, ## Task, etc.
 */
export function readSessionSummary(workspacePath: string, sessionId: string): SessionSummary | null {
  try {
    const filePath = getSummaryPath(workspacePath, sessionId);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf-8');
    const summary: SessionSummary = { rawContent: content };

    // Parse sections
    const sections = content.split(/\n## /);
    for (const section of sections) {
      const lines = section.trim().split('\n');
      const header = lines[0]!.replace(/^#+\s*/, '').toLowerCase();
      const body = lines.slice(1).join('\n').trim();

      switch (header) {
        case 'session title':
        case 'title':
          summary.title = body;
          break;
        case 'current state':
          summary.currentState = body;
          break;
        case 'task specification':
        case 'task':
          summary.task = body;
          break;
        case 'files and functions':
        case 'files':
          summary.files = body.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
          break;
        case 'errors & corrections':
        case 'errors':
          summary.errors = body.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
          break;
        case 'learnings':
          summary.learnings = body.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
          break;
        case 'key results':
        case 'results':
          summary.results = body.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
          break;
      }
    }

    return summary;
  } catch {
    return null;
  }
}

/**
 * Write a SessionSummary to the session's summary.md file.
 */
export function writeSessionSummary(
  workspacePath: string,
  sessionId: string,
  summary: SessionSummary,
): boolean {
  try {
    const filePath = getSummaryPath(workspacePath, sessionId);
    const sections: string[] = [];

    if (summary.title) {
      sections.push(`# Session Title\n${summary.title}`);
    }
    if (summary.currentState) {
      sections.push(`## Current State\n${summary.currentState}`);
    }
    if (summary.task) {
      sections.push(`## Task Specification\n${summary.task}`);
    }
    if (summary.files?.length) {
      sections.push(`## Files and Functions\n${summary.files.map(f => `- ${f}`).join('\n')}`);
    }
    if (summary.errors?.length) {
      sections.push(`## Errors & Corrections\n${summary.errors.map(e => `- ${e}`).join('\n')}`);
    }
    if (summary.learnings?.length) {
      sections.push(`## Learnings\n${summary.learnings.map(l => `- ${l}`).join('\n')}`);
    }
    if (summary.results?.length) {
      sections.push(`## Key Results\n${summary.results.map(r => `- ${r}`).join('\n')}`);
    }

    const content = sections.join('\n\n') + '\n';
    fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
