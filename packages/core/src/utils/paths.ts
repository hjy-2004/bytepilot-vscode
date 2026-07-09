/**
 * Portable path sanitization utilities.
 * Ported from Claude Code's sanitizePath pattern:
 * - Replace non-alphanumeric chars with hyphens for human-readable dir names
 * - Truncate long paths (>200 chars) with hash suffix for uniqueness
 */

/** Maximum length for a single filesystem path component. */
const MAX_SANITIZED_LENGTH = 200;

/**
 * DJB2 hash — simple, fast, deterministic string hash.
 * Used for the truncation suffix when paths exceed MAX_SANITIZED_LENGTH.
 */
export function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash >>>= 0; // force unsigned
  }
  return hash;
}

/**
 * Make a path safe for use as a directory or file name.
 *
 * Replaces all non-alphanumeric characters with hyphens. This ensures
 * compatibility across platforms including Windows (colons, backslashes,
 * etc. are replaced).
 *
 * For deeply nested paths exceeding filesystem limits (~255 bytes per
 * component), truncates to 200 chars and appends a hash suffix for
 * uniqueness.
 *
 * Example:
 *   "D:\\extension_plugin" → "D--extension-plugin"
 *   "/home/user/my-project" → "-home-user-my-project"
 */
export function sanitizePath(name: string): string {
  // Replace non-alnum → dash. Multiple consecutive non-alnum chars
  // produce multiple dashes (e.g. "D:\" → "D--") — this is intentional
  // to preserve path structure information.
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-');
  if (!sanitized || sanitized === '-') {
    return 'default-workspace';
  }
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  const hash = Math.abs(djb2Hash(name)).toString(36);
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`;
}
