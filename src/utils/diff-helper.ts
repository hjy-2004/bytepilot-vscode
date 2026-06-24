import { structuredPatch, type ParsedDiff } from 'diff';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { UnifiedDiff, DiffLine, DiffHunk } from '../types/diff';

/**
 * Compute a UnifiedDiff from two content strings.
 */
export function computeDiffFromContent(
  fileName: string,
  oldContent: string,
  newContent: string,
): UnifiedDiff {
  const patch: ParsedDiff = structuredPatch(fileName, fileName, oldContent, newContent, '', '', {
    context: 3,
  });

  return parsedDiffToUnified(patch, fileName);
}

/**
 * Compute a UnifiedDiff between two file paths.
 */
export function computeDiffFromPaths(
  fileName: string,
  oldPath: string,
  newPath: string,
): UnifiedDiff {
  const oldContent = fs.readFileSync(oldPath, 'utf-8');
  const newContent = fs.readFileSync(newPath, 'utf-8');
  return computeDiffFromContent(fileName, oldContent, newContent);
}

/**
 * Compute a UnifiedDiff between the working tree file and its git HEAD version.
 */
export function computeDiffFromGit(
  filePath: string,
  workspaceRoot: string,
): UnifiedDiff {
  const fullPath = path.resolve(workspaceRoot, filePath);
  const newContent = fs.readFileSync(fullPath, 'utf-8');

  let oldContent: string;
  try {
    // Normalize path for git (always use forward slashes relative to repo root)
    const gitPath = filePath.replace(/\\/g, '/');
    // Reject paths with shell metacharacters to prevent command injection
    if (/[$`;"|&(){}[\]<>!*?\\~']/.test(gitPath)) {
      throw new Error('File path contains unsafe characters for git operation.');
    }
    oldContent = execSync(`git show HEAD:"${gitPath}"`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // File not in git (new file) — treat as empty old content
    oldContent = '';
  }

  return computeDiffFromContent(filePath, oldContent, newContent);
}

/**
 * Convert the `diff` library's ParsedDiff to our UnifiedDiff format.
 */
function parsedDiffToUnified(patch: ParsedDiff, fileName: string): UnifiedDiff {
  let additions = 0;
  let deletions = 0;
  const hunks: DiffHunk[] = [];

  for (const hunk of patch.hunks) {
    const lines: DiffLine[] = [];
    let oldLineNumber = hunk.oldStart;
    let newLineNumber = hunk.newStart;

    for (const line of hunk.lines) {
      const prefix = line.charAt(0);
      const content = line.substring(1);

      if (prefix === '+') {
        additions++;
        lines.push({
          type: 'added',
          newLineNumber: newLineNumber++,
          content,
        });
      } else if (prefix === '-') {
        deletions++;
        lines.push({
          type: 'removed',
          oldLineNumber: oldLineNumber++,
          content,
        });
      } else {
        // context line (prefix is ' ')
        lines.push({
          type: 'context',
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
          content,
        });
      }
    }

    hunks.push({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines,
    });
  }

  return {
    fileName,
    oldFileName: patch.oldFileName ?? undefined,
    newFileName: patch.newFileName ?? undefined,
    stats: { additions, deletions },
    hunks,
  };
}
