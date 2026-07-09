import * as fs from 'fs';
import * as path from 'path';
import { getAutoMemPath } from './paths';
import type { MemoryEntry, MemoryFrontmatter, MemoryType } from './types';
import { logInfo, logError } from '../platform/logger';

/**
 * Auto-memory CRUD operations.
 *
 * Each memory topic is stored as a .md file with YAML frontmatter:
 *   ---
 *   name: {{name}}
 *   description: {{description}}
 *   type: {{type}}
 *   ---
 *   {{body}}
 */

// ============================================================
// Frontmatter parsing
// ============================================================

function parseFrontmatter(content: string): { frontmatter: MemoryFrontmatter; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const raw = match[1]!;
  const body = match[2]!;
  const fm: Partial<MemoryFrontmatter> = {};

  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!.trim();
    if (key === 'name') fm.name = value;
    else if (key === 'description') fm.description = value;
    else if (key === 'type' && ['user', 'feedback', 'project', 'reference'].includes(value)) {
      fm.type = value as MemoryType;
    }
  }

  if (!fm.name || !fm.type) return null;
  return {
    frontmatter: { name: fm.name, description: fm.description || '', type: fm.type },
    body,
  };
}

function formatFrontmatter(fm: MemoryFrontmatter, body: string): string {
  return `---
name: ${fm.name}
description: ${fm.description}
type: ${fm.type}
---
${body}`;
}

// ============================================================
// CRUD
// ============================================================

/**
 * Read a single memory file by slug (filename without .md).
 * Returns null if the file doesn't exist or is malformed.
 */
export function readMemory(workspacePath: string, slug: string): MemoryEntry | null {
  try {
    const filePath = path.join(getAutoMemPath(workspacePath), `${slug}.md`);
    if (!fs.existsSync(filePath)) return null;

    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed) return null;

    return {
      slug,
      filePath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      mtime: stat.mtimeMs,
    };
  } catch (err) {
    logError(`Failed to read memory: ${slug}`, err);
    return null;
  }
}

/**
 * Write (create or update) a memory file.
 */
export function writeMemory(
  workspacePath: string,
  slug: string,
  frontmatter: MemoryFrontmatter,
  body: string,
): boolean {
  try {
    const dir = getAutoMemPath(workspacePath);
    const filePath = path.join(dir, `${slug}.md`);
    const content = formatFrontmatter(frontmatter, body);
    fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 });
    logInfo(`[memory] Wrote: ${slug}`);
    return true;
  } catch (err) {
    logError(`Failed to write memory: ${slug}`, err);
    return false;
  }
}

/**
 * Delete a memory file by slug.
 */
export function deleteMemory(workspacePath: string, slug: string): boolean {
  try {
    const filePath = path.join(getAutoMemPath(workspacePath), `${slug}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo(`[memory] Deleted: ${slug}`);
    }
    return true;
  } catch (err) {
    logError(`Failed to delete memory: ${slug}`, err);
    return false;
  }
}

/**
 * List all memory files in the auto-memory directory.
 * Returns slugs (filenames without .md extension).
 */
export function listMemoryFiles(workspacePath: string): string[] {
  try {
    const dir = getAutoMemPath(workspacePath);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      .map(f => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * Read all memory entries for a workspace into a Map keyed by slug.
 */
export function readAllMemories(workspacePath: string): Map<string, MemoryEntry> {
  const memories = new Map<string, MemoryEntry>();
  for (const slug of listMemoryFiles(workspacePath)) {
    const entry = readMemory(workspacePath, slug);
    if (entry) memories.set(slug, entry);
  }
  return memories;
}
