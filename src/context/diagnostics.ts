import * as vscode from 'vscode';
import type { DiagnosticInfo } from '../types/context';

/**
 * Collects diagnostics (errors, warnings) for open files.
 */
export function collectDiagnostics(): DiagnosticInfo[] {
  const allDiagnostics = vscode.languages.getDiagnostics();
  const openUris = new Set<string>();

  // Build set of open file paths
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input as { uri?: vscode.Uri } | undefined;
      if (input?.uri?.scheme === 'file') {
        openUris.add(input.uri.fsPath);
      }
    }
  }

  const result: DiagnosticInfo[] = [];
  for (const [uri, diags] of allDiagnostics) {
    if (!openUris.has(uri.fsPath) || diags.length === 0) continue;

    for (const d of diags) {
      if (result.length >= 50) break; // Limit total diagnostics
      result.push({
        filePath: uri.fsPath,
        severity:
          d.severity === vscode.DiagnosticSeverity.Error
            ? 'error'
            : d.severity === vscode.DiagnosticSeverity.Warning
              ? 'warning'
              : 'info',
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        message: d.message,
      });
    }
  }

  return result;
}
