import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { sanitizePath } from '../utils/paths';

/**
 * Auto-memory path resolution.
 * Following Claude Code's memdir/paths.ts pattern:
 *   ~/.bytepilot/projects/<sanitized-git-root>/memory/
 */

const BASE_DIR = path.join(os.homedir(), '.bytepilot', 'projects');
const MEMORY_DIRNAME = 'memory';
const MEMORY_ENTRYPOINT = 'MEMORY.md';

/** Whether auto-memory is enabled (default true). Can be disabled via env. */
let _autoMemoryEnabled: boolean | undefined;
export function isAutoMemoryEnabled(): boolean {
  if (_autoMemoryEnabled !== undefined) return _autoMemoryEnabled;
  const env = process.env.BYTEPILOT_DISABLE_AUTO_MEMORY;
  if (env === '1' || env === 'true') {
    _autoMemoryEnabled = false;
    return false;
  }
  _autoMemoryEnabled = true;
  return true;
}

/** For testing: override the auto-memory enabled state */
export function setAutoMemoryEnabled(v: boolean): void {
  _autoMemoryEnabled = v;
}

/**
 * Resolve the git root for a workspace path.
 * Falls back to the workspace path itself if no .git directory found.
 */
function findGitRoot(workspacePath: string): string {
  let current = path.resolve(workspacePath);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(workspacePath);
}

/**
 * Returns the auto-memory directory for a workspace.
 *
 * Shape: ~/.bytepilot/projects/<sanitized-git-root>/memory/
 *
 * The git root is used (not the cwd) so all worktrees and subdirectories
 * within the same repo share one memory directory.
 */
export function getAutoMemPath(workspacePath: string): string {
  const gitRoot = findGitRoot(workspacePath);
  const sanitized = sanitizePath(gitRoot);
  const dir = path.join(BASE_DIR, sanitized, MEMORY_DIRNAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * Returns the auto-memory entrypoint (MEMORY.md) for a workspace.
 */
export function getAutoMemEntrypoint(workspacePath: string): string {
  return path.join(getAutoMemPath(workspacePath), MEMORY_ENTRYPOINT);
}

/**
 * Check if an absolute path is within the auto-memory directory.
 */
export function isAutoMemPath(workspacePath: string, absolutePath: string): boolean {
  const memPath = getAutoMemPath(workspacePath);
  return absolutePath.startsWith(memPath);
}
