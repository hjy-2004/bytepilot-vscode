/**
 * VS Code implementation of IEditorHost.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import type { IEditorHost, EditorSelection, DiagnosticEntry, CommandResult } from '@bytepilot/core';

export class VSCodeEditorHost implements IEditorHost {
  constructor(private workspaceRoot: string) {}

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async executeCommand(command: string, cwd: string, timeoutMs: number, env?: Record<string, string>): Promise<CommandResult> {
    const terminal = vscode.window.createTerminal({
      name: 'BytePilot Command',
      cwd,
      env,
      hideFromUser: true,
    });
    return new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;
      const timeout = setTimeout(() => { killed = true; terminal.dispose(); }, timeoutMs);
      // Note: VS Code terminals don't give us stdout/stderr directly.
      // For document-oriented use, we use child_process in the caller.
      // This is a best-effort integration.
      const disposable = vscode.window.onDidCloseTerminal((t) => {
        if (t === terminal) {
          clearTimeout(timeout);
          disposable.dispose();
          resolve({ stdout, stderr, exitCode: killed ? 1 : 0, killed });
        }
      });
      terminal.show(false);
      terminal.sendText(command);
    });
  }

  getDiagnostics(filePath?: string): DiagnosticEntry[] {
    if (filePath) {
      const diags = vscode.languages.getDiagnostics(vscode.Uri.file(filePath));
      return diags.map(d => ({
        filePath,
        severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' as const
          : d.severity === vscode.DiagnosticSeverity.Warning ? 'warning' as const : 'info' as const,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        message: d.message,
      }));
    }
    const all = vscode.languages.getDiagnostics();
    return all.flatMap(([uri, diags]) =>
      diags.map(d => ({
        filePath: uri.fsPath,
        severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' as const
          : d.severity === vscode.DiagnosticSeverity.Warning ? 'warning' as const : 'info' as const,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        message: d.message,
      }))
    );
  }

  getOpenFiles(): string[] {
    return vscode.window.tabGroups.all.flatMap(g =>
      g.tabs.filter(t => t.input && typeof t.input === 'object' && 'uri' in (t.input as any))
        .map(t => path.relative(this.workspaceRoot, ((t.input as any).uri as vscode.Uri).fsPath))
    );
  }

  async getOpenFileContent(relativePath: string): Promise<string | undefined> {
    try {
      const fullPath = path.resolve(this.workspaceRoot, relativePath);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      return doc.getText();
    } catch {
      return undefined;
    }
  }

  getActiveSelection(): EditorSelection | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return undefined;
    const sel = editor.selection;
    return {
      filePath: path.relative(this.workspaceRoot, editor.document.uri.fsPath),
      startLine: sel.start.line + 1,
      endLine: sel.end.line + 1,
      text: editor.document.getText(sel),
    };
  }

  async getProjectStructure(): Promise<string> {
    const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**}', 200);
    return uris.map(u => path.relative(this.workspaceRoot, u.fsPath)).join('\n');
  }

  async getProjectRules(): Promise<string | undefined> {
    try {
      const rulesPath = path.join(this.workspaceRoot, '.bytepilotrules');
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(rulesPath));
      return doc.getText();
    } catch {
      return undefined;
    }
  }

  getPlatform(): string {
    return process.platform;
  }
}
