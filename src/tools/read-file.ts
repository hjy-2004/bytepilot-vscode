import { z } from 'zod';
import * as path from 'path';
import type { ToolDef } from '../types/tools';

export const readFileTool: ToolDef = {
  name: 'read_file',
  displayName: 'Read File',
  description: 'Read a file from the workspace. Supports line ranges for large files.',
  permissionLevel: 'read',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultChars: Infinity,
  inputSchema: z.object({
    filePath: z.string().describe('Path relative to workspace root'),
    startLine: z.number().int().positive().optional().describe('Start line (1-indexed)'),
    endLine: z.number().int().positive().optional().describe('End line (1-indexed, inclusive)'),
  }),
  getToolUseSummary(args) {
    const range = args.startLine ? ` L${args.startLine}${args.endLine ? `-${args.endLine}` : ''}` : '';
    return `${args.filePath}${range}`;
  },
  async call(args, ctx) {
    const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
    if (ctx.fs && !ctx.fs.isWithinWorkspace(fullPath)) {
      return `Error: Access denied. "${args.filePath}" is outside the workspace.`;
    }
    try {
      const fs = ctx.fs;
      if (!fs) return 'Error: No filesystem available.';
      const st = await fs.stat(fullPath);
      if (st.size > 1024 * 1024) {
        return `Error: File too large (${(st.size / 1024 / 1024).toFixed(1)}MB). Use startLine/endLine to read specific ranges.`;
      }
      const content = await fs.readFile(fullPath);
      const lines = content.split('\n');
      const start = (args.startLine ?? 1) - 1;
      const end = args.endLine ? Math.min(args.endLine, lines.length) : lines.length;
      if (start < 0 || start >= lines.length) {
        return `Error: startLine ${args.startLine} out of range (file has ${lines.length} lines).`;
      }
      const selected = lines.slice(start, end);
      const output = selected.map((l, i) => `${String(start + i + 1).padStart(4, ' ')}| ${l}`).join('\n');
      const note = end < lines.length ? ` (${lines.length - end} more lines)` : '';
      return `${args.filePath} (L${start + 1}-${end}/${lines.length})${note}\n\n${output}`;
    } catch (err: any) {
      if (err.code === 'FileNotFound' || err.code === 'ENOENT') return `Error: File not found: ${args.filePath}`;
      return `Error: ${err.message}`;
    }
  },
};
