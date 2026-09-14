import path from 'path';

/**
 * SEC-3 (tasks/fable-pass-2-audit.md, index.js:291-305): the built-in media
 * lookup (`resolveBuiltInMediaAssetPath`, driven by the renderer-supplied
 * names on the `system:resolveBuiltInMedia` IPC channel) joins the requested
 * name straight onto the `test-media/` directory with `path.join`, which
 * COLLAPSES `..` segments rather than rejecting them — so a name like
 * `../../../../etc/passwd` escapes the directory instead of erroring.
 *
 * This is the pure guard: a name is safe to join only when it names exactly
 * one entry directly inside the built-in media directory — no separators
 * (forward or back slash, so a Windows-style traversal string can't slip past
 * this check when it runs on a POSIX host, where `path.basename` alone would
 * not split on `\`), and not empty, `.`, or `..`.
 */
export function isSafeBuiltInMediaAssetName(name: unknown): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\\')) return false;
  return path.basename(name) === name;
}
