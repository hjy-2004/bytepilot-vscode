import { z } from 'zod';
import * as path from 'path';
import type { ToolDef } from '../types/tools';
import { computeDiffFromPaths, computeDiffFromGit } from '../utils/diff-helper';

export const diffFileTool: ToolDef = {
  name: 'diff_file',
  displayName: 'Diff File',
  description:
    'Compute a unified diff between two file paths, or between a file and its git HEAD version.',
  permissionLevel: 'read',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultChars: 4000,
  inputSchema: z.object({
    filePath: z.string().describe('Primary file path relative to workspace root'),
    comparePath: z
      .string()
      .optional()
      .describe(
        'Optional: second file path to compare against. If omitted, diffs against git HEAD.',
      ),
  }),
  getToolUseSummary(args) {
    return args.comparePath
      ? `${args.filePath} ↔ ${args.comparePath}`
      : `${args.filePath} vs HEAD`;
  },
  async call(args, ctx) {
    try {
      if (args.comparePath) {
        const oldPath = path.resolve(ctx.workspaceRoot, args.filePath as string);
        const newPath = path.resolve(ctx.workspaceRoot, args.comparePath as string);
        // Validate both paths are within workspace
        const wsRoot = ctx.workspaceRoot + path.sep;
        if (
          (!oldPath.startsWith(wsRoot) && oldPath !== ctx.workspaceRoot) ||
          (!newPath.startsWith(wsRoot) && newPath !== ctx.workspaceRoot)
        ) {
          return `Error: Cannot read files outside workspace.`;
        }
        const diff = computeDiffFromPaths(
          path.basename(args.filePath as string),
          oldPath,
          newPath,
        );
        ctx.onDiff?.(diff);
        return `Diff: ${diff.stats.additions} additions, ${diff.stats.deletions} deletions across ${diff.hunks.length} hunks.`;
      } else {
        const diff = computeDiffFromGit(args.filePath as string, ctx.workspaceRoot);
        ctx.onDiff?.(diff);
        if (diff.stats.additions === 0 && diff.stats.deletions === 0) {
          return `No changes in "${args.filePath}" compared to HEAD.`;
        }
        return `Diff against HEAD: ${diff.stats.additions} additions, ${diff.stats.deletions} deletions across ${diff.hunks.length} hunks.`;
      }
    } catch (err: any) {
      return `Error computing diff: ${err.message}`;
    }
  },
};
