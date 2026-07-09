/**
 * Auto-memory type definitions.
 * Following Claude Code's memdir/memoryTypes.ts pattern.
 */

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

/** Frontmatter in each memory .md file */
export interface MemoryFrontmatter {
  name: string;
  description: string;
  type: MemoryType;
}

/** Full memory entry with file path and content */
export interface MemoryEntry {
  /** Filename without extension (e.g. "user_role") */
  slug: string;
  /** Absolute path to the .md file */
  filePath: string;
  /** Parsed frontmatter */
  frontmatter: MemoryFrontmatter;
  /** Content body (everything after frontmatter) */
  body: string;
  /** File modification time */
  mtime: number;
}
