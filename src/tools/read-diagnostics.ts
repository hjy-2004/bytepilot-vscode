import { z } from 'zod';
import * as vscode from 'vscode';
import type { ToolDef } from '../types/tools';

export const readDiagnosticsTool: ToolDef = {
  name: 'read_diagnostics',
  displayName: 'Read Diagnostics',
  description: 'Read VS Code errors/warnings for open files.',
  permissionLevel: 'notify',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultChars: 4000,
  inputSchema: z.object({
    filePath: z.string().optional().describe('Specific file to check. If omitted, checks all open files.'),
  }),
  getToolUseSummary(args) {
    return args.filePath || 'all open files';
  },
  async call(args, ctx) {
    try {
      const openUris = new Set(
        vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => (t.input as any)?.uri?.fsPath).filter(Boolean) as string[]
      );
      const all = vscode.languages.getDiagnostics();
      const relevant = all.filter(([uri, diags]) => {
        if (diags.length === 0) return false;
        if (args.filePath) return uri.fsPath.includes(args.filePath);
        return openUris.has(uri.fsPath);
      });
      if (relevant.length === 0) return 'No diagnostics found.';
      const lines: string[] = [];
      for (const [uri, diags] of relevant) {
        const rel = uri.fsPath.replace(ctx.workspaceRoot, '').replace(/^[/\\]/, '');
        lines.push(`\n${rel}:`);
        for (const d of diags.slice(0, 15)) {
          const s = d.severity === vscode.DiagnosticSeverity.Error ? 'ERR' : d.severity === vscode.DiagnosticSeverity.Warning ? 'WRN' : 'INF';
          lines.push(`  [${s}] L${d.range.start.line + 1}: ${d.message}`);
        }
        if (diags.length > 15) lines.push(`  ... (${diags.length - 15} more)`);
      }
      return lines.join('\n');
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
