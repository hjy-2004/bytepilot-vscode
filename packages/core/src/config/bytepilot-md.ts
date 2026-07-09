import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logInfo } from '../platform/logger';

/**
 * BYTEPILOT.md hierarchy loader.
 *
 * Loads instructions from multiple sources in priority order (last = highest priority):
 *
 *   1. Global user BYTEPILOT.md:  ~/.bytepilot/BYTEPILOT.md
 *   2. Project BYTEPILOT.md:      traversed upward from CWD to root
 *   3. Local BYTEPILOT.local.md:  gitignored, private per-project
 *
 * Also falls back to .bytepilotrules for backward compatibility.
 */

export interface BytePilotMdSection {
  /** Human-readable source (e.g. "~/.bytepilot/BYTEPILOT.md") */
  source: string;
  /** The markdown content */
  content: string;
  /** Priority (higher = later, wins in conflicts) */
  priority: number;
}

/**
 * Load all BYTEPILOT.md sources for a workspace.
 * Returns sections sorted by priority (lowest first).
 */
export function loadBytePilotMd(workspaceRoot: string): BytePilotMdSection[] {
  const sections: BytePilotMdSection[] = [];
  let priority = 0;

  // 1. Global user BYTEPILOT.md
  const globalPath = path.join(os.homedir(), '.bytepilot', 'BYTEPILOT.md');
  if (fs.existsSync(globalPath)) {
    try {
      sections.push({
        source: `~/.bytepilot/BYTEPILOT.md`,
        content: fs.readFileSync(globalPath, 'utf-8').trim(),
        priority: priority++,
      });
      logInfo(`[bytepilot-md] Loaded global: ${globalPath}`);
    } catch { /* skip */ }
  }

  // 2. Project BYTEPILOT.md — traverse upward from workspaceRoot
  let current = path.resolve(workspaceRoot);
  const projectPaths: string[] = [];
  for (let i = 0; i < 10; i++) {
    const mdPath = path.join(current, 'BYTEPILOT.md');
    if (fs.existsSync(mdPath) && !projectPaths.includes(mdPath)) {
      projectPaths.push(mdPath);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Reverse so root is lowest priority, CWD is highest
  for (const mdPath of projectPaths.reverse()) {
    try {
      sections.push({
        source: mdPath,
        content: fs.readFileSync(mdPath, 'utf-8').trim(),
        priority: priority++,
      });
      logInfo(`[bytepilot-md] Loaded project: ${mdPath}`);
    } catch { /* skip */ }
  }

  // 3. Fallback: .bytepilotrules (backward compat)
  const rulesPath = path.join(workspaceRoot, '.bytepilotrules');
  if (fs.existsSync(rulesPath)) {
    try {
      sections.push({
        source: `${workspaceRoot}/.bytepilotrules`,
        content: fs.readFileSync(rulesPath, 'utf-8').trim(),
        priority: priority++,
      });
      logInfo(`[bytepilot-md] Loaded .bytepilotrules (legacy)`);
    } catch { /* skip */ }
  }

  // 4. Local BYTEPILOT.local.md (private, gitignored)
  const localPath = path.join(workspaceRoot, 'BYTEPILOT.local.md');
  if (fs.existsSync(localPath)) {
    try {
      sections.push({
        source: `${workspaceRoot}/BYTEPILOT.local.md`,
        content: fs.readFileSync(localPath, 'utf-8').trim(),
        priority: priority++,
      });
      logInfo(`[bytepilot-md] Loaded local: ${localPath}`);
    } catch { /* skip */ }
  }

  return sections;
}

/**
 * Merge all loaded BYTEPILOT.md sections into a single prompt block.
 * Empty sections are skipped. Returns empty string if nothing loaded.
 */
export function buildBytePilotMdPrompt(workspaceRoot: string): string {
  const sections = loadBytePilotMd(workspaceRoot);
  if (sections.length === 0) return '';

  const parts: string[] = [];
  for (const section of sections) {
    if (section.content) {
      parts.push(section.content);
    }
  }
  return parts.join('\n\n');
}
