/**
 * Singleton logger for @bytepilot/core.
 * Set the platform-specific implementation via `setCoreLogger()` at startup.
 */
import type { ILogger } from '../types/platform';

let _logger: ILogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  show: () => {},
};

export function setCoreLogger(logger: ILogger): void {
  _logger = logger;
}

export function getCoreLogger(): ILogger {
  return _logger;
}

export function logInfo(message: string): void {
  _logger.info(message);
}

export function logError(message: string, err?: unknown): void {
  _logger.error(message, err);
}

export function logWarn(message: string): void {
  _logger.warn(message);
}
