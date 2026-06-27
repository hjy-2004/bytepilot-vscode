import { z } from 'zod';
import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolDef } from '../types/tools';
import { getSemanticSearch } from '../context/semantic-search';

export const searchFilesTool: ToolDef = {
  name: 'search_files',
  displayName: 'Search Files',
  description: 'Search file names (glob) or file contents (text/semantic) in the workspace. Use semantic=true for relevance-ranked BM25 search.',
  permissionLevel: 'read',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultChars: 8000,
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern or text to search'),
    searchType: z.enum(['file', 'content']).optional().describe('file=glob, content=text search. Default: content'),
    maxResults: z.number().int().positive().optional().describe('Max results. Default: 20'),
    semantic: z.boolean().optional().describe('Use BM25 relevance-ranked search instead of substring matching. Default: false'),
  }),
  getToolUseSummary(args) {
    if (args.semantic) return `semantic: ${args.pattern}`;
    return args.searchType === 'file' ? `glob: ${args.pattern}` : `grep: ${args.pattern}`;
  },
  async call(args, ctx) {
    const maxResults = args.maxResults ?? 20;
    const exclude = '**/node_modules/**,**/dist/**,**/.git/**';

    // Semantic search mode
    if (args.semantic) {
      try {
        const ss = getSemanticSearch();
        if (!ss.isReady()) {
          await ss.buildIndex();
        }
        const results = ss.search(args.pattern, maxResults);
        if (results.length === 0) return `No results for "${args.pattern}"`;
        const snippets: string[] = [];
        for (const r of results) {
          const snippet = await ss.getSnippet(r.path, args.pattern);
          if (snippet) {
            snippets.push(snippet);
          } else {
            snippets.push(`${r.path} (score: ${r.score.toFixed(2)})`);
          }
        }
        return snippets.length > 0
          ? snippets.join('\n\n---\n\n')
          : `No results for "${args.pattern}"`;
      } catch (err: any) {
        return `Semantic search error: ${err.message}. Falling back to text search...`;
      }
    }

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
      const MAX_FILE_SIZE = 256 * 1024; // 256KB per file for content search
      for (const uri of uris) {
        if (results.length >= maxResults) break;
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > MAX_FILE_SIZE) continue; // Skip large files
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
