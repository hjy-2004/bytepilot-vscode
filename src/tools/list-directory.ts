import { z } from 'zod';
import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolDef } from '../types/tools';

const EXCLUDES = ['node_modules', '.git', 'dist', 'out', '.next', '__pycache__', '.venv'];

export const listDirectoryTool: ToolDef = {
  name: 'list_directory',
  displayName: 'List Directory',
  description: 'List directory contents with sizes. Respects common ignore patterns.',
  permissionLevel: 'read',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultChars: 8000,
  inputSchema: z.object({
    directoryPath: z.string().optional().describe('Path relative to workspace. Default: root'),
    depth: z.number().int().min(1).max(3).optional().describe('Recursion depth. Default: 1'),
  }),
  getToolUseSummary(args) {
    return args.directoryPath || '.';
  },
  async call(args, ctx) {
    const depth = args.depth ?? 1;
    const dirPath = args.directoryPath ? path.resolve(ctx.workspaceRoot, args.directoryPath) : ctx.workspaceRoot;
    const result: string[] = [];

    async function walk(dir: string, d: number, indent: string = ''): Promise<void> {
      if (d > depth || result.length >= 200) return;
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
        for (const [name, type] of entries) {
          if (EXCLUDES.includes(name) || name.startsWith('.')) continue;
          if (result.length >= 200) break;
          const rel = path.relative(ctx.workspaceRoot, path.join(dir, name));
          if (type === vscode.FileType.Directory) {
            result.push(`${indent}${rel}/`);
            if (d < depth) await walk(path.join(dir, name), d + 1, indent + '  ');
          } else {
            try {
              const stat = await vscode.workspace.fs.stat(vscode.Uri.file(path.join(dir, name)));
              const size = stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`;
              result.push(`${indent}${rel} (${size})`);
            } catch { result.push(`${indent}${rel}`); }
          }
        }
      } catch { /* skip */ }
    }

    try {
      await walk(dirPath, 0);
      if (result.length === 0) return 'Directory empty or inaccessible.';
      if (result.length >= 200) result.push('... (truncated)');
      return result.join('\n');
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
