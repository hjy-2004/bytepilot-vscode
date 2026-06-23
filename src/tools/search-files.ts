import { z } from 'zod';
import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolDef } from '../types/tools';

export const searchFilesTool: ToolDef = {
  name: 'search_files',
  displayName: 'Search Files',
  description: 'Search file names (glob) or file contents (text) in the workspace.',
  permissionLevel: 'read',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultChars: 5000,
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern or text to search'),
    searchType: z.enum(['file', 'content']).optional().describe('file=glob, content=text search. Default: content'),
    maxResults: z.number().int().positive().optional().describe('Max results. Default: 20'),
  }),
  getToolUseSummary(args) {
    return args.searchType === 'file' ? `glob: ${args.pattern}` : `grep: ${args.pattern}`;
  },
  async call(args, ctx) {
    const maxResults = args.maxResults ?? 20;
    const exclude = '**/node_modules/**,**/dist/**,**/.git/**';
    try {
      if (args.searchType === 'file') {
        const pat = args.pattern.startsWith('**/') ? args.pattern : `**/${args.pattern}`;
        const uris = await vscode.workspace.findFiles(pat, exclude, maxResults);
        if (uris.length === 0) return `No files matching "${args.pattern}"`;
        return uris.map(u => `- ${path.relative(ctx.workspaceRoot, u.fsPath)}`).join('\n');
      }
      const uris = await vscode.workspace.findFiles('**/*', exclude, maxResults * 3);
      const results: { file: string; line: number; text: string }[] = [];
      const lower = args.pattern.toLowerCase();
      for (const uri of uris) {
        if (results.length >= maxResults) break;
        try {
          const lines = (await vscode.workspace.fs.readFile(uri)).toString().split('\n');
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (lines[i].toLowerCase().includes(lower)) {
              results.push({ file: path.relative(ctx.workspaceRoot, uri.fsPath), line: i + 1, text: lines[i].trim().substring(0, 200) });
            }
          }
        } catch { /* skip */ }
      }
      return results.length === 0 ? `No matches for "${args.pattern}"` : results.map(r => `${r.file}:${r.line} | ${r.text}`).join('\n');
    } catch (err: any) {
      return `Search error: ${err.message}`;
    }
  },
};
