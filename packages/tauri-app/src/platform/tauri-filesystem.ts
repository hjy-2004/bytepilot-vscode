/**
 * Tauri implementation of IFileSystem.
 * Uses Tauri invoke commands to access the native file system.
 */
import type { IFileSystem, FileStat } from '@bytepilot/core';

export class TauriFileSystem implements IFileSystem {
  private invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;

  constructor(invokeFn: (cmd: string, args?: Record<string, unknown>) => Promise<any>) {
    this.invoke = invokeFn;
  }

  async readFile(absolutePath: string): Promise<string> {
    return this.invoke('cmd_read_file', { path: absolutePath });
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    await this.invoke('cmd_write_file', { path: absolutePath, content });
  }

  async createDirectory(absolutePath: string): Promise<void> {
    await this.invoke('cmd_create_dir', { path: absolutePath });
  }

  async readDirectory(absolutePath: string): Promise<Array<[string, boolean]>> {
    return this.invoke('cmd_read_dir', { path: absolutePath });
  }

  async stat(absolutePath: string): Promise<FileStat> {
    return this.invoke('cmd_stat', { path: absolutePath });
  }

  async exists(absolutePath: string): Promise<boolean> {
    return this.invoke('cmd_exists', { path: absolutePath });
  }

  async findFiles(
    basePath: string,
    include: string,
    exclude: string,
    maxResults: number,
  ): Promise<string[]> {
    return this.invoke('cmd_find_files', {
      basePath,
      include,
      exclude,
      maxResults,
    });
  }

  resolvePath(relativePath: string): string {
    // For the sidecar, we use path.resolve against the workspace root
    // which is obtained via getWorkspaceRoot
    return relativePath;
  }

  async isWithinWorkspace(absolutePath: string): Promise<boolean> {
    try {
      return await this.invoke('cmd_is_within_workspace', { absolute: absolutePath });
    } catch {
      return false;
    }
  }
}
