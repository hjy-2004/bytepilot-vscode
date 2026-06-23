import * as vscode from 'vscode';
import * as path from 'path';
import type { OpenFileInfo } from '../types/context';

/**
 * Collects information about currently open editor tabs.
 */
export async function collectOpenFiles(
  workspaceRoot: string,
  maxFiles: number = 10
): Promise<OpenFileInfo[]> {
  const result: OpenFileInfo[] = [];
  const seen = new Set<string>();

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (result.length >= maxFiles) break;

      const input = tab.input as { uri?: vscode.Uri } | undefined;
      if (!input?.uri) continue;

      const fsPath = input.uri.fsPath;
      if (seen.has(fsPath)) continue;
      seen.add(fsPath);

      // Skip non-file URIs
      if (input.uri.scheme !== 'file') continue;

      // Skip very large files and binary-looking files
      const ext = path.extname(fsPath).toLowerCase();
      const binaryExts = ['.exe', '.dll', '.so', '.dylib', '.png', '.jpg', '.gif', '.pdf', '.zip'];
      if (binaryExts.includes(ext)) continue;

      try {
        const doc = await vscode.workspace.openTextDocument(input.uri);
        const content = doc.getText();
        const lines = content.split('\n');
        const preview = lines.slice(0, 200).join('\n');

        result.push({
          path: path.relative(workspaceRoot, fsPath) || fsPath,
          language: doc.languageId,
          lineCount: lines.length,
          content: lines.length <= 200 ? content : preview,
        });
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return result;
}
