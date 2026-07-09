import { z } from 'zod';
import * as path from 'path';
import type { ToolDef } from '../types/tools';
import { computeDiffFromContent } from '../utils/diff-helper';

export const writeFileTool: ToolDef = {
  name: 'write_file',
  displayName: 'Write File',
  description:
    'Create a NEW file or completely overwrite an existing one. ' +
    'IMPORTANT: For editing existing files, prefer edit_file instead — it only changes the specified lines and preserves the rest. ' +
    'Only use write_file when creating a brand new file or when the entire file needs to be replaced.',
  permissionLevel: 'write',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  maxResultChars: 2000,
  inputSchema: z.object({
    filePath: z.string().describe('Path relative to workspace root'),
    content: z.string().describe('Full content to write'),
  }),
  getToolUseSummary(args) {
    return `${args.filePath} (${args.content?.length || 0} chars)`;
  },
  async getPreviewDiff(args, ctx) {
    try {
      const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
      const fs = ctx.fs;
      if (!fs) return undefined;
      let original = '';
      try {
        original = await fs.readFile(fullPath);
      } catch {
        // File doesn't exist — diff shows all new content
      }
      return computeDiffFromContent(args.filePath, original, args.content);
    } catch { return undefined; }
  },
  async call(args, ctx) {
    const fs = ctx.fs;
    if (!fs) return 'Error: No filesystem available.';
    const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
    if (!fs.isWithinWorkspace(fullPath)) {
      return `Error: Cannot write outside workspace.`;
    }
    try {
      const dir = path.dirname(fullPath);
      await fs.createDirectory(dir);

      // Check if file already exists (for diff generation)
      let original: string | null = null;
      try {
        original = await fs.readFile(fullPath);
      } catch {
        // File doesn't exist yet — no diff to generate
      }

      await fs.writeFile(fullPath, args.content);

      if (original !== null && ctx.onDiff) {
        const unifiedDiff = computeDiffFromContent(args.filePath, original, args.content);
        ctx.onDiff(unifiedDiff);
      }

      return `Wrote ${args.content.split('\n').length} lines to "${args.filePath}".`;
    } catch (err: any) {
      return `Error writing file: ${err?.message || err}`;
    }
  },
};
