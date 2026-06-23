import { z } from 'zod';
import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolDef } from '../types/tools';

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
  async call(args, ctx) {
    const fullPath = path.resolve(ctx.workspaceRoot, args.filePath);
    if (!fullPath.startsWith(ctx.workspaceRoot + path.sep) && fullPath !== ctx.workspaceRoot) {
      return `Error: Cannot edit outside workspace.`;
    }

    try {
      const uri = vscode.Uri.file(fullPath);
      let original: string;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > MAX_FILE_SIZE) {
          return `Error: File too large (${(stat.size / 1024).toFixed(0)}KB). Use write_file for full replacement.`;
        }
        original = (await vscode.workspace.fs.readFile(uri)).toString();
      } catch {
        return `Error: File not found: ${args.filePath}. Use write_file to create a new file.`;
      }

      const oldStr = args.oldString;
      const newStr = args.newString;

      // Normalize line endings: Windows \r\n → \n
      const normalizeNewlines = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normalizedOriginal = normalizeNewlines(original);
      const normalizedOld = normalizeNewlines(oldStr);

      // Smart matching: try exact first, then normalized, then with quote normalization
      let matchIndex = original.indexOf(oldStr);
      if (matchIndex === -1) {
        matchIndex = normalizedOriginal.indexOf(normalizedOld);
      }
      if (matchIndex === -1) {
        const normQ = (s: string) => s.replace(/['']/g, "'").replace(/[""]/g, '"');
        matchIndex = normQ(normalizedOriginal).indexOf(normQ(normalizedOld));
      }

      if (matchIndex === -1) {
        // Show relevant context to help the AI fix its old_string
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

      // Check for duplicate matches (on normalized text)
      const actualOldLen = normalizedOld.length;
      const afterMatch = normalizedOriginal.substring(matchIndex + actualOldLen);
      if (afterMatch.includes(normalizedOld)) {
        return `Error: old_string matches multiple locations. Add more surrounding context (2-3 lines) to make it unique.`;
      }

      // Apply the edit on normalized text, then restore original line endings
      const isCRLF = original.includes('\r\n');
      const newStrNormalized = normalizeNewlines(newStr);
      const editedNormalized = normalizedOriginal.substring(0, matchIndex) + newStrNormalized + normalizedOriginal.substring(matchIndex + actualOldLen);
      const edited = isCRLF ? editedNormalized.replace(/\n/g, '\r\n') : editedNormalized;

      await vscode.workspace.fs.writeFile(uri, Buffer.from(edited, 'utf-8'));

      const changedLines = (edited.match(/\n/g) || []).length - (original.match(/\n/g) || []).length;
      const changed = changedLines !== 0 ? ` (${changedLines > 0 ? '+' : ''}${changedLines} lines)` : '';
      return `Successfully edited ${args.filePath}: replaced ${oldStr.length}→${newStr.length} chars${changed}.`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
