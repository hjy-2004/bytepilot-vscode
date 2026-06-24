/**
 * Diff data structures shared between extension host and webview.
 * Mirrored from src/types/diff.ts — keep in sync.
 */

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  fileName: string;
  oldFileName?: string;
  newFileName?: string;
  stats: {
    additions: number;
    deletions: number;
  };
  hunks: DiffHunk[];
}
