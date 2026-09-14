import { describe, it, expect } from 'vitest';
import { isSafeBuiltInMediaAssetName } from '../mediaAssetSafety';

// SEC-3 (tasks/fable-pass-2-audit.md, index.js:291-305): the built-in media
// lookup (`resolveBuiltInMediaAssetPath`, driven by the `system:resolveBuiltInMedia`
// IPC channel with a renderer-supplied name) joins the requested name straight
// onto `test-media/` with `path.join`, which COLLAPSES `..` segments instead of
// rejecting them — so a name like `../../../../etc/passwd` escapes the
// directory. This is the pure guard: a name is safe only when it names one
// entry directly inside the built-in media directory.

describe('isSafeBuiltInMediaAssetName', () => {
  it('rejects a single parent-directory traversal', () => {
    expect(isSafeBuiltInMediaAssetName('../evil.png')).toBe(false);
  });

  it('rejects a multi-level parent-directory traversal', () => {
    expect(isSafeBuiltInMediaAssetName('../../../../etc/passwd')).toBe(false);
  });

  it('rejects a Windows-style backslash traversal', () => {
    expect(isSafeBuiltInMediaAssetName('..\\..\\evil.png')).toBe(false);
  });

  it('rejects a POSIX absolute path', () => {
    expect(isSafeBuiltInMediaAssetName('/etc/passwd')).toBe(false);
  });

  it('rejects a Windows absolute path', () => {
    expect(isSafeBuiltInMediaAssetName('C:\\Windows\\System32\\config\\SAM')).toBe(false);
  });

  it('rejects a nested (non-traversing) path', () => {
    expect(isSafeBuiltInMediaAssetName('a/b.png')).toBe(false);
  });

  it('rejects a nested backslash path', () => {
    expect(isSafeBuiltInMediaAssetName('a\\b.png')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isSafeBuiltInMediaAssetName('')).toBe(false);
  });

  it('rejects "."', () => {
    expect(isSafeBuiltInMediaAssetName('.')).toBe(false);
  });

  it('rejects ".."', () => {
    expect(isSafeBuiltInMediaAssetName('..')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isSafeBuiltInMediaAssetName(undefined)).toBe(false);
    expect(isSafeBuiltInMediaAssetName(null)).toBe(false);
    expect(isSafeBuiltInMediaAssetName(42)).toBe(false);
    expect(isSafeBuiltInMediaAssetName(['hymn.png'])).toBe(false);
  });

  it('allows a normal built-in media name', () => {
    expect(isSafeBuiltInMediaAssetName('hymn.png')).toBe(true);
  });

  it('allows a normal name containing spaces', () => {
    expect(isSafeBuiltInMediaAssetName('sunset background.jpg')).toBe(true);
  });

  it('allows a name with multiple dots (extension-only, not traversal)', () => {
    expect(isSafeBuiltInMediaAssetName('hymn.v2.png')).toBe(true);
  });
});
