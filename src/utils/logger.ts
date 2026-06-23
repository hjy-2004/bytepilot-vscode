import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | null = null;

export function getLogger(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('AI Coding Agent', { log: true });
  }
  return outputChannel;
}

export function logInfo(message: string): void {
  const logger = getLogger();
  logger.appendLine(`[INFO] ${new Date().toISOString()} ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const logger = getLogger();
  const errorStr = error instanceof Error ? error.stack || error.message : String(error || '');
  logger.appendLine(`[ERROR] ${new Date().toISOString()} ${message} ${errorStr}`);
}

export function logDebug(message: string): void {
  const logger = getLogger();
  logger.appendLine(`[DEBUG] ${new Date().toISOString()} ${message}`);
}

export function disposeLogger(): void {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = null;
  }
}
