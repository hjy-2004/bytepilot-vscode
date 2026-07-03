import { z } from 'zod';
import * as path from 'path';
import type { ToolDef } from '../types/tools';
import { computeDiffFromContent } from '../utils/diff-helper';

const MAX_FILE_SIZE = 500 * 1024; // 500KB

export const editFileTool: ToolDef = {
  name: 'edit_file',
  displayName: 'Edit File',
  description:
    'Performs exact string replacements in files.\n' +
    'Usage:\n' +
    '- You MUST use read_file at least once before editing. This tool will error if you attempt an edit without reading the file.\n' +
    '- When editing text from Read tool output, preserve the exact indentation (tabs/spaces) as it appears. Never include line number prefixes in old_string or new_string.\n' +
    '- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.\n' +
    '- The edit will FAIL if old_string is not unique in the file. Provide a larger string with more surrounding context to make it unique.\n' +
    '- Use the smallest old_string that is clearly unique — 2-4 adjacent lines is usually sufficient.',
  permissionLevel: 'write',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  maxResultChars: 4000,
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file, relative to workspace root'),
    oldString: z.string().describe('The exact text to replace. Must be unique in the file.'),
    newString: z.string().describe('The text to replace it with. Use empty string to delete.'),
  }),
  getToolUseSummary(args) {
    return `${args.filePath}: replace ${args.oldString?.length || 0}→${args.newString?.length || 0} chars`;
  },
  async getPreviewDiff(args, ctx) {
    try {
      const fs = ctx.fs;
      if (!fs) return undefined;
      const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
      const original = await fs.readFile(fullPath);
      const nor = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let idx = original.indexOf(args.oldString);
      if (idx === -1) idx = nor(original).indexOf(nor(args.oldString));
      if (idx === -1) return undefined;
      const oldLen = nor(args.oldString).length;
      const edited = nor(original).substring(0, idx) + nor(args.newString) + nor(original).substring(idx + oldLen);
      return computeDiffFromContent(args.filePath, original, edited);
    } catch { return undefined; }
  },
  async call(args, ctx) {
    const fs = ctx.fs;
    if (!fs) return 'Error: No filesystem available.';
    const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
    if (!fs.isWithinWorkspace(fullPath)) {
      return `Error: Cannot edit outside workspace.`;
    }

    try {
      let original: string;
      try {
        const st = await fs.stat(fullPath);
        if (st.size > MAX_FILE_SIZE) {
          return `Error: File too large (${(st.size / 1024).toFixed(0)}KB). Use write_file for full replacement.`;
        }
        original = await fs.readFile(fullPath);
      } catch {
        return `Error: File not found: ${args.filePath}. Use write_file to create a new file.`;
      }

      const oldStr = args.oldString;
      const newStr = args.newString;

      const normalizeNewlines = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normalizedOriginal = normalizeNewlines(original);
      const normalizedOld = normalizeNewlines(oldStr);

      let matchIndex = original.indexOf(oldStr);
      if (matchIndex === -1) {
        matchIndex = normalizedOriginal.indexOf(normalizedOld);
      }
      if (matchIndex === -1) {
        const normQ = (s: string) => s.replace(/['']/g, "'").replace(/[""]/g, '"');
        matchIndex = normQ(normalizedOriginal).indexOf(normQ(normalizedOld));
      }

      if (matchIndex === -1) {
        const lines = normalizedOriginal.split('\n');
        const oldFirstLine = normalizedOld.split('\n')[0] || '';
        let bestMatch = '';
        for (const line of lines) {
          if (line.trim() && line.includes(oldFirstLine.trim().substring(0, 10))) {
            bestMatch = line;
            break;
          }
        }
        const hint = bestMatch
          ? `Did you mean a line like: "${bestMatch}"? Check whitespace and line endings.`
          : 'Try re-reading the file with read_file to see the exact current content.';
        return `Error: old_string not found.\n${hint}`;
      }

      const actualOldLen = normalizedOld.length;
      const afterMatch = normalizedOriginal.substring(matchIndex + actualOldLen);
      if (afterMatch.includes(normalizedOld)) {
        return `Error: old_string matches multiple locations. Add more surrounding context (2-3 lines) to make it unique.`;
      }

      const isCRLF = original.includes('\r\n');
      const newStrNormalized = normalizeNewlines(newStr);
      const editedNormalized = normalizedOriginal.substring(0, matchIndex) + newStrNormalized + normalizedOriginal.substring(matchIndex + actualOldLen);
      const edited = isCRLF ? editedNormalized.replace(/\n/g, '\r\n') : editedNormalized;

      await fs.writeFile(fullPath, edited);

      if (ctx.onDiff) {
        const unifiedDiff = computeDiffFromContent(args.filePath, original, edited);
        ctx.onDiff(unifiedDiff);
      }

      const changedLines = (edited.match(/\n/g) || []).length - (original.match(/\n/g) || []).length;
      const changed = changedLines !== 0 ? ` (${changedLines > 0 ? '+' : ''}${changedLines} lines)` : '';
      return `Successfully edited ${args.filePath}: replaced ${oldStr.length}→${newStr.length} chars${changed}.`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
