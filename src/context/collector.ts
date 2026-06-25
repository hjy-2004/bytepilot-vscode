import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { collectOpenFiles } from './open-files';
import { collectProjectStructure } from './project-structure';
import { collectDiagnostics } from './diagnostics';
import { collectSelection } from './selection';
import { logInfo } from '../utils/logger';
import type { ContextSnapshot } from '../types/context';

/**
 * Orchestrates all context sources and formats context for the AI's system prompt.
 */
export class ContextCollector {
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  }

  updateWorkspaceRoot(): void {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  }

  /** Collect all context sources into a snapshot */
  async collect(): Promise<ContextSnapshot> {
    this.updateWorkspaceRoot();

    const [openFiles, projectStructure, diagnostics, selection, rules] = await Promise.all([
      collectOpenFiles(this.workspaceRoot).catch(() => []),
      collectProjectStructure(this.workspaceRoot).catch(() => ''),
      Promise.resolve(collectDiagnostics()),
      Promise.resolve(collectSelection(this.workspaceRoot)),
      collectProjectRules(this.workspaceRoot).catch(() => undefined),
    ]);

    return {
      openFiles,
      projectStructure,
      diagnostics,
      activeSelection: selection,
      projectRules: rules,
      timestamp: Date.now(),
    };
  }

  /** Format a context snapshot as a string for the AI system prompt */
  formatForPrompt(snapshot: ContextSnapshot): string {
    const parts: string[] = [];

    // Project rules
    if (snapshot.projectRules) {
      parts.push('<project_rules>');
      parts.push(snapshot.projectRules);
      parts.push('</project_rules>');
    }

    // Project structure
    if (snapshot.projectStructure) {
      parts.push('<project_structure>');
      parts.push(snapshot.projectStructure);
      parts.push('</project_structure>');
    }

    // Open files
    if (snapshot.openFiles.length > 0) {
      parts.push('\n<open_files>');
      for (const file of snapshot.openFiles) {
        parts.push(`\n### ${file.path} (${file.language}, ${file.lineCount} lines)`);
        if (file.content) {
          // Show first 200 lines max
          const lines = file.content.split('\n');
          const display = lines.slice(0, 200).join('\n');
          parts.push('```' + file.language);
          parts.push(display);
          if (lines.length > 200) {
            parts.push(`... (${lines.length - 200} more lines)`);
          }
          parts.push('```');
        }
      }
      parts.push('</open_files>');
    }

    // Active selection
    if (snapshot.activeSelection) {
      const sel = snapshot.activeSelection;
      parts.push(`\n<active_selection file="${sel.filePath}" lines="${sel.startLine}-${sel.endLine}">`);
      parts.push('```');
      parts.push(sel.text);
      parts.push('```');
      parts.push('</active_selection>');
    }

    // Diagnostics
    if (snapshot.diagnostics.length > 0) {
      parts.push('\n<diagnostics>');
      for (const d of snapshot.diagnostics) {
        const icon = d.severity === 'error' ? '❌' : d.severity === 'warning' ? '⚠️' : 'ℹ️';
        parts.push(`${icon} ${d.filePath}:${d.line} - ${d.message}`);
      }
      parts.push('</diagnostics>');
    }

    const result = parts.join('\n');
    logInfo(`Context collected: ${snapshot.openFiles.length} open files, ${snapshot.diagnostics.length} diagnostics`);
    return result;
  }

  /** Collect and format context in one call */
  async getContextString(): Promise<string> {
    const snapshot = await this.collect();
    return this.formatForPrompt(snapshot);
  }
}

/** Read .bytepilotrules from workspace root (plain text / markdown) */
async function collectProjectRules(workspaceRoot: string): Promise<string | undefined> {
  const rulesPath = path.join(workspaceRoot, '.bytepilotrules');
  try {
    if (!fs.existsSync(rulesPath)) return undefined;
    const content = fs.readFileSync(rulesPath, 'utf-8').trim();
    if (!content) return undefined;
    logInfo(`Loaded .bytepilotrules: ${content.length} chars`);
    return content;
  } catch {
    return undefined;
  }
}
