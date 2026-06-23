import * as vscode from 'vscode';
import * as path from 'path';
import type { SelectionInfo } from '../types/context';

/**
 * Collects information about the current text selection.
 */
export function collectSelection(workspaceRoot: string): SelectionInfo | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return undefined;

  const doc = editor.document;
  const selection = editor.selection;
  const text = doc.getText(selection);

  if (text.length > 5000) return undefined; // Skip very large selections

  return {
    filePath: path.relative(workspaceRoot, doc.uri.fsPath) || doc.uri.fsPath,
    startLine: selection.start.line + 1,
    endLine: selection.end.line + 1,
    text,
  };
}
