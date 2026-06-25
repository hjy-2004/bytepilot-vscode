import * as vscode from 'vscode';

let outputChannel: vscode.LogOutputChannel | null = null;

export function getLogger(): vscode.LogOutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('BytePilot', { log: true });
  }
  return outputChannel;
}

/** Info-level log with timestamp. Rendered in blue/cyan by VS Code. */
export function logInfo(message: string): void {
  const logger = getLogger();
  logger.info(`${timestamp()} ${message}`);
}

/** Error-level log with optional error details. Rendered in red by VS Code. */
export function logError(message: string, error?: unknown): void {
  const logger = getLogger();
  const errorStr = error instanceof Error ? error.stack || error.message : String(error || '');
  logger.error(`${timestamp()} ${message}${errorStr ? ' ' + errorStr : ''}`);
}

/** Debug-level log. Rendered in dim gray by VS Code. */
export function logDebug(message: string): void {
  const logger = getLogger();
  logger.debug(`${timestamp()} ${message}`);
}

/** Warning-level log. Rendered in yellow by VS Code. */
export function logWarn(message: string): void {
  const logger = getLogger();
  logger.warn(`${timestamp()} ${message}`);
}

export function disposeLogger(): void {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = null;
  }
}

export function showLogger(preserveFocus?: boolean): void {
  getLogger().show(preserveFocus ?? false);
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}
