import { z } from 'zod';
import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolDef } from '../types/tools';

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
  async call(args, ctx) {
    const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
    if (!fullPath.startsWith(ctx.workspaceRoot + path.sep) && fullPath !== ctx.workspaceRoot) {
      return `Error: Cannot write outside workspace.`;
    }
    try {
      const dir = path.dirname(fullPath);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
      const uri = vscode.Uri.file(fullPath);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(args.content, 'utf-8'));
      return `Wrote ${args.content.split('\n').length} lines to "${args.filePath}".`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
};
