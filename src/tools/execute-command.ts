import { z } from 'zod';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import type { ToolDef } from '../types/tools';

const DANGEROUS = [
  /rm\s+-rf\s+\//, /git\s+push\s+--force\s+.*(main|master)/,
  /sudo\s+rm/, /:\s*\{\s*:\|:&\s*};?:/,
];

export const executeCommandTool: ToolDef = {
  name: 'execute_command',
  displayName: 'Run Command',
  description: 'Execute a shell command. For installing packages, running tests, building.',
  permissionLevel: 'write',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  maxResultChars: 5000,
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    workingDirectory: z.string().optional().describe('Working directory. Default: workspace root'),
    timeout: z.number().int().positive().optional().describe('Max seconds. Default: 30'),
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

    return new Promise(resolve => {
      const terminal = vscode.window.createTerminal({ name: 'AI Agent', cwd });
      terminal.show();
      const escaped = args.command.replace(/'/g, "'\\''");
      terminal.sendText(`echo '\x1b[33m> ${escaped}\x1b[0m'`);

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
        });
    });
  },
};
