import { z } from 'zod';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import type { ToolDef } from '../types/tools';

// Block destructive file operations, force push to protected branches, and obfuscated payloads.
// This is a defense-in-depth measure on top of the tool approval flow.
// IMPORTANT: This is a best-effort blocklist — it does NOT replace the approval gate.
// Users must still manually review command output for safety.
const DANGEROUS = [
  // Recursive deletion from root
  /\brm\s+.*-r.*\s+\//, /\brm\s+.*-r.*\s+\/etc\b/, /\brm\s+.*-r.*\s+\/home\b/,
  /\brmdir\s+\//, /\bdel\s+\/[a-z]/i, /\bdeltree\s+\//i,
  // Force push to main/master/protected branches
  /\bgit\s+push\s+.*--force.*\s+(main|master|release|prod)/,
  /\bgit\s+push\s+.*-f\s+(main|master|release|prod)/,
  // Fork bombs and shell injection patterns
  /:\s*\{\s*:\|:&\s*};\s*:?/, /\$\(\s*echo\s+.*\|\s*base64\s+-d\s*\)/,
  // Curl/wget piped to shell execution
  /\bcurl\s+.*\|\s*(ba)?sh\b/, /\bwget\s+.*-O\s*-\s*.*\|\s*(ba)?sh\b/,
  // chmod opening up everything
  /\bchmod\s+.*777\s+\//, /\bchmod\s+.*-R\s+777\s+\//,
  // Disk formatting / destructive system commands
  /\bmkfs\./, /\bdd\s+if=.*of=\/dev\//, /\b>\/dev\/sd/,
  // Argument injection: -- followed by shell meta-characters
  /\s--\s*[;|&`$]/,
  // Reboot / shutdown
  /\b(shutdown|reboot|halt|poweroff)\b/,
  // Format entire disks on Windows
  /\bformat\s+[a-zA-Z]:\s*\/[qQ]/,
  // Git reset hard on branches
  /\bgit\s+reset\s+--hard\b/,
  // Delete important directories recursively via find
  /\bfind\s+\/.*-exec\s+rm\b/,
];

export const executeCommandTool: ToolDef = {
  name: 'execute_command',
  displayName: 'Run Command',
  description: 'Execute a shell command silently (no visible terminal). Set showTerminal=true to show terminal. For installing packages, running tests, building.',
  permissionLevel: 'write',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  maxResultChars: 5000,
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    workingDirectory: z.string().optional().describe('Working directory. Default: workspace root'),
    timeout: z.number().int().positive().optional().describe('Max seconds. Default: 30'),
    showTerminal: z.boolean().optional().describe('Show terminal while executing. Default: false (silent)'),
  }),
  getToolUseSummary(args) {
    return args.command.length > 80 ? args.command.substring(0, 80) + '...' : args.command;
  },
  async call(args, ctx) {
    for (const p of DANGEROUS) {
      if (p.test(args.command)) return `Blocked: dangerous command pattern detected.`;
    }
    const timeoutMs = (args.timeout ?? 30) * 1000;
    const cwd = args.workingDirectory ?? ctx.workspaceRoot;
    const showTerminal = args.showTerminal ?? false;

    return new Promise(resolve => {
      let terminal: vscode.Terminal | null = null;
      if (showTerminal) {
        terminal = vscode.window.createTerminal({ name: 'AI Agent', cwd });
        terminal.show();
        terminal.sendText(`echo '\x1b[33m> ${args.command}\x1b[0m'`);
      }

      exec(args.command, { cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash' },
        (error, stdout, stderr) => {
          let out = '';
          if (stdout) out += stdout;
          if (stderr) out += (out ? '\n' : '') + stderr;
          if (error) {
            resolve(error.killed
              ? `Timed out after ${args.timeout ?? 30}s.\n\n${out.slice(-3000)}`
              : `Exit code ${error.code}.\n\n${out.slice(-3000)}`);
          } else {
            const truncated = out.length > 5000 ? out.slice(0, 5000) + '\n...(truncated)' : out;
            resolve(`OK.\n\n${truncated || '(no output)'}`);
          }
          // Dispose terminal after command completes (only if we created one)
          if (terminal) {
            terminal.dispose();
          }
        });
    });
  },
};
