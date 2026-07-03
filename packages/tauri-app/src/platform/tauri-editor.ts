/**
 * Tauri implementation of IEditorHost.
 * Provides workspace information and command execution via the Rust backend.
 */
import type { IEditorHost, EditorSelection, DiagnosticEntry, CommandResult } from '@bytepilot/core';

export class TauriEditorHost implements IEditorHost {
  private invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;
  private workspaceRoot: string;

  constructor(
    invokeFn: (cmd: string, args?: Record<string, unknown>) => Promise<any>,
    workspaceRoot: string,
  ) {
    this.invoke = invokeFn;
    this.workspaceRoot = workspaceRoot;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async executeCommand(
    command: string,
    cwd: string,
    timeoutMs: number,
    _env?: Record<string, string>,
  ): Promise<CommandResult> {
    return this.invoke('cmd_execute_command', { command, cwd, timeoutMs });
  }

  getDiagnostics(_filePath?: string): DiagnosticEntry[] {
    // Desktop app doesn't have LSP diagnostics — return empty
    return [];
  }

  getOpenFiles(): string[] {
    // Desktop app doesn't track open editors
    return [];
  }

  async getOpenFileContent(_relativePath: string): Promise<string | undefined> {
    return undefined;
  }

  getActiveSelection(): EditorSelection | undefined {
    return undefined;
  }

  async getProjectStructure(): Promise<string> {
    try {
      const files = await this.invoke('cmd_find_files', {
        basePath: this.workspaceRoot,
        include: '**/*',
        exclude: '{**/node_modules/**,**/.git/**,**/dist/**,**/target/**}',
        maxResults: 200,
      });
      return (files as string[]).join('\n');
    } catch {
      return '';
    }
  }

  async getProjectRules(): Promise<string | undefined> {
    try {
      const path = `${this.workspaceRoot}/.bytepilotrules`.replace(/\\/g, '/');
      return this.invoke('cmd_read_file', { path });
    } catch {
      return undefined;
    }
  }

  getPlatform(): string {
    return process.platform;
  }
}
