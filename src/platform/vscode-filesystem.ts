/**
 * VS Code implementation of IFileSystem.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import type { IFileSystem, FileStat } from '@bytepilot/core';

export class VSCodeFileSystem implements IFileSystem {
  constructor(private workspaceRoot: string) {}

  async readFile(absolutePath: string): Promise<string> {
    const uri = vscode.Uri.file(absolutePath);
    return (await vscode.workspace.fs.readFile(uri)).toString();
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(absolutePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  }

  async createDirectory(absolutePath: string): Promise<void> {
    const uri = vscode.Uri.file(absolutePath);
    await vscode.workspace.fs.createDirectory(uri);
  }

  async readDirectory(absolutePath: string): Promise<Array<[string, boolean]>> {
    const uri = vscode.Uri.file(absolutePath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries.map(([name, type]) => [name, (type & vscode.FileType.Directory) !== 0] as [string, boolean]);
  }

  async stat(absolutePath: string): Promise<FileStat> {
    const uri = vscode.Uri.file(absolutePath);
    const st = await vscode.workspace.fs.stat(uri);
    return { size: st.size, isDirectory: (st.type & vscode.FileType.Directory) !== 0, isFile: (st.type & vscode.FileType.File) !== 0 };
  }

  async exists(absolutePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(absolutePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  async findFiles(basePath: string, include: string, exclude: string, maxResults: number): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(include, exclude, maxResults);
    return uris.map(u => path.relative(basePath, u.fsPath));
  }

  resolvePath(relativePath: string): string {
    return path.resolve(this.workspaceRoot, relativePath);
  }

  isWithinWorkspace(absolutePath: string): boolean {
    const normalized = path.normalize(absolutePath);
    const root = path.normalize(this.workspaceRoot);
    return normalized.startsWith(root + path.sep) || normalized === root;
  }
}
