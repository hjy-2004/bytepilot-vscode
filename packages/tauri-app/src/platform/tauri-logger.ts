/**
 * Tauri file-based logger implementation of ILogger.
 *
 * Uses Tauri invoke to call the Rust cmd_write_log command,
 * which writes to %APPDATA%/bytepilot/logs/bytepilot.log.
 *
 * Also echoes to console.log/error/warn for instant visibility
 * when running in dev mode with DevTools open.
 */
import type { ILogger } from '@bytepilot/core';

let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

export function initLogger(
  invokeFn: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>,
): ILogger {
  _invoke = invokeFn;

  return {
    info(message: string): void {
      console.log(`[BytePilot] ${message}`);
      writeLog('info', message);
    },

    error(message: string, err?: unknown): void {
      console.error(`[BytePilot] ${message}`, err);
      const detail = err instanceof Error ? (err.stack || err.message) : String(err || '');
      writeLog('error', message, detail);
    },

    warn(message: string): void {
      console.warn(`[BytePilot] ${message}`);
      writeLog('warn', message);
    },

    debug(message: string): void {
      console.debug(`[BytePilot] ${message}`);
      writeLog('debug', message);
    },

    show(): void {
      // In desktop app, this could open the log file in the default editor
      getLogPath().then((path) => {
        console.log(`[BytePilot] Log file: ${path}`);
      });
    },
  };
}

async function writeLog(level: string, message: string, errorDetail?: string): Promise<void> {
  if (!_invoke) return;
  try {
    await _invoke('cmd_write_log', {
      level,
      message: message.substring(0, 2000),
      errorDetail: errorDetail?.substring(0, 2000) || null,
    });
  } catch {
    // Log write failed — don't cascade
  }
}

export async function getLogPath(): Promise<string> {
  if (!_invoke) return '(logger not initialized)';
  try {
    return (await _invoke('cmd_get_log_path')) as string;
  } catch {
    return '(unavailable)';
  }
}

export async function getLogStats(): Promise<{ path: string; size: number }> {
  if (!_invoke) return { path: '', size: 0 };
  try {
    return (await _invoke('cmd_get_log_stats')) as { path: string; size: number };
  } catch {
    return { path: '', size: 0 };
  }
}

export async function readLogs(): Promise<string> {
  if (!_invoke) return '';
  try {
    return (await _invoke('cmd_read_logs')) as string;
  } catch {
    return '(unavailable)';
  }
}

export async function clearLogs(): Promise<void> {
  if (!_invoke) return;
  try {
    await _invoke('cmd_clear_logs');
  } catch { /* ignore */ }
}
