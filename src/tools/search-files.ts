import { z } from 'zod';
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
        if (ctx.fs && !ss.isReady()) {
          const fs = ctx.fs as any;
          if (fs.findFilesForSearch) {
            ss.setWorkspaceRoot(ctx.workspaceRoot);
            ss.setProvider({
              findFiles: (inc: string, exc: string, max: number) => fs.findFiles(ctx.workspaceRoot, inc, exc, max),
              readFile: (p: string) => fs.readFile(p),
              stat: (p: string) => fs.stat(p).then((s: any) => ({ size: s.size })),
            });
          }
        }
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
        return `Semantic search error: ${err.message}.`;
      }
    }

    try {
      const fs = ctx.fs;
      if (!fs) return 'Error: No filesystem available.';

      if (args.searchType === 'file') {
        const pat = args.pattern.startsWith('**/') ? args.pattern : `**/${args.pattern}`;
        const files = await fs.findFiles(ctx.workspaceRoot, pat, exclude, maxResults);
        if (files.length === 0) return `No files matching "${args.pattern}"`;
        return files.map(f => `- ${path.relative(ctx.workspaceRoot, f)}`).join('\n');
      }
      const files = await fs.findFiles(ctx.workspaceRoot, '**/*', exclude, maxResults * 3);
      const results: { file: string; line: number; text: string }[] = [];
      const lower = args.pattern.toLowerCase();
      const MAX_FILE_SIZE = 256 * 1024;
      for (const filePath of files) {
        if (results.length >= maxResults) break;
        try {
          const st = await fs.stat(path.resolve(ctx.workspaceRoot, filePath));
          if (st.size > MAX_FILE_SIZE) continue;
          const content = await fs.readFile(path.resolve(ctx.workspaceRoot, filePath));
          const lines = content.split('\n');
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (lines[i].toLowerCase().includes(lower)) {
              results.push({ file: path.relative(ctx.workspaceRoot, filePath), line: i + 1, text: lines[i].trim().substring(0, 200) });
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
