/**
 * Diff data structures shared between extension host and webview.
 * The extension host computes diffs using the `diff` npm package;
 * the webview renders them without ever importing `diff` directly.
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
