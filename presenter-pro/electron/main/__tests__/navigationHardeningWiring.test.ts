import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Mechanical guard for plan SEC1 (tasks/fable-pass-2-audit.md SEC-1, SEC-3).
//
// electron/main/index.js cannot be imported in a unit test — it loads
// `electron` and opens a database at import time (see
// lifecycleListeners.test.ts). So, same as that file, this one reads the
// SOURCE TEXT to prove the pure decision functions in navigationPolicy.ts and
// mediaAssetSafety.ts are actually wired up, not just defined and tested in
// isolation.

const dirname = fileURLToPath(new URL('.', import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(dirname, '../index.js'), 'utf8');

describe('SEC-1: window-open / navigation hardening is wired into index.js', () => {
  it('requires the pure navigation-policy module', () => {
    expect(MAIN_SOURCE).toContain("require('./navigationPolicy')");
  });

  it('registers an app-wide web-contents-created guard', () => {
    expect(MAIN_SOURCE).toContain("app.on('web-contents-created'");
  });

  it('denies every window.open via setWindowOpenHandler', () => {
    expect(MAIN_SOURCE).toContain('setWindowOpenHandler(');
  });

  it('guards will-navigate through the tested isAllowedNavigation function', () => {
    // Both must be present, and specifically together: a will-navigate
    // listener that never consults isAllowedNavigation would pass a looser
    // "contains both strings anywhere" check while doing nothing.
    expect(MAIN_SOURCE).toMatch(/\.on\('will-navigate',[\s\S]{0,400}isAllowedNavigation\(/);
  });

  it('prevents the default when a will-navigate target is not allowed', () => {
    expect(MAIN_SOURCE).toMatch(
      /isAllowedNavigation\([\s\S]{0,200}\)\s*\)\s*\{\s*[\s\S]{0,80}event\.preventDefault\(\)/
    );
  });
});

describe('SEC-3: built-in media lookup rejects traversal', () => {
  it('requires the pure media-asset-safety module', () => {
    expect(MAIN_SOURCE).toContain("require('./mediaAssetSafety')");
  });

  it('resolveBuiltInMediaAssetPath calls the traversal guard before resolving', () => {
    const match = MAIN_SOURCE.match(
      /function resolveBuiltInMediaAssetPath\([^)]*\)\s*\{[\s\S]*?\n\}/
    );
    expect(match, 'resolveBuiltInMediaAssetPath must still exist under that name').not.toBeNull();
    expect(match![0]).toContain('isSafeBuiltInMediaAssetName(');
  });
});

describe('build wiring', () => {
  it('emits navigationPolicy and mediaAssetSafety as their own entry points', () => {
    // Same reason as closeController's entry in lifecycleListeners.test.ts:
    // the main process is CommonJS, so require('./navigationPolicy') and
    // require('./mediaAssetSafety') are left external rather than inlined.
    // Without an explicit rollup input there is no out/main/navigationPolicy.js
    // (or mediaAssetSafety.js) and the packaged app crashes on launch with
    // "Cannot find module" — a failure the build reports as SUCCESS.
    const viteConfig = readFileSync(resolve(dirname, '../../../electron.vite.config.js'), 'utf8');
    for (const entry of ["'main/navigationPolicy'", "'main/mediaAssetSafety'"]) {
      expect(viteConfig, `${entry} must be a rollup input`).toContain(entry);
    }
  });
});
