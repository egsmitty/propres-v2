import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Mechanical guard for phase7 finding #0 (see tasks/phase8-architecture-audit.md
// — "the pass is judged on rules added, not lines changed").
//
// The app shipped unquittable for months because `before-quit` was simply
// absent, and nothing anywhere could notice an ABSENCE. The closeController
// tests prove the decision logic is correct; this file proves the main process
// is still WIRED to it.
//
// It reads source text rather than importing, because electron/main/index.js
// pulls in `electron`, `better-sqlite3`, and opens a database at import time —
// none of which can load in a unit test.

const dirname = fileURLToPath(new URL('.', import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(dirname, '../index.js'), 'utf8');

/**
 * Every app-level lifecycle event the main process must handle, and why.
 * This table is exhaustive — adding a row is how you add a requirement.
 */
const REQUIRED_APP_LISTENERS: ReadonlyArray<{ event: string; why: string }> = [
  {
    event: 'before-quit',
    why: 'marks shutdown so the close handler stops preventDefault-ing; without it Cmd+Q is silently cancelled',
  },
  {
    event: 'window-all-closed',
    why: 'quits on non-darwin platforms',
  },
  {
    event: 'activate',
    why: 'recreates the window when the dock icon is clicked on macOS',
  },
];

const REQUIRED_WEBCONTENTS_LISTENERS: ReadonlyArray<{ event: string; why: string }> = [
  {
    event: 'render-process-gone',
    why: 'a dead renderer can never answer the close handshake, so the window would be stranded',
  },
];

describe('main process lifecycle wiring', () => {
  it.each(REQUIRED_APP_LISTENERS)('registers app.on($event) — $why', ({ event }) => {
    expect(MAIN_SOURCE).toContain(`app.on('${event}'`);
  });

  it.each(REQUIRED_WEBCONTENTS_LISTENERS)(
    'registers webContents.on($event) — $why',
    ({ event }) => {
      expect(MAIN_SOURCE).toContain(`.on('${event}'`);
    }
  );

  it('routes the window close decision through the tested controller', () => {
    // If someone reinstates ad-hoc boolean flags in the close handler, the
    // logic escapes its tests again — which is exactly how this bug happened.
    expect(MAIN_SOURCE).toContain('closeController.decideClose(');
    expect(MAIN_SOURCE).toContain('createCloseController');
  });

  it('no longer carries the untestable inline close flags', () => {
    // These three module-level booleans WERE the bug: unreachable by any test,
    // and one of them could latch true forever.
    for (const flag of ['allowMainWindowClose', 'appIsQuitting', 'mainWindowCloseRequestPending']) {
      expect(MAIN_SOURCE).not.toContain(flag);
    }
  });
});

describe('build wiring', () => {
  it('emits closeController as its own entry point', () => {
    // The main process is CommonJS, so `require('./closeController')` is left
    // external rather than inlined. Without an explicit rollup input there is
    // no out/main/closeController.js and the packaged app crashes on launch
    // with "Cannot find module" — a failure the build reports as SUCCESS.
    const viteConfig = readFileSync(resolve(dirname, '../../../electron.vite.config.js'), 'utf8');
    expect(viteConfig).toContain("'main/closeController'");
  });

  it('emits the migration modules as their own entry points', () => {
    // migrations.js requires migrationRunner, which requires migrationPlanner.
    // Both are left external by the CommonJS main build and need entries, or
    // the app crashes at startup with "Cannot find module".
    const viteConfig = readFileSync(resolve(dirname, '../../../electron.vite.config.js'), 'utf8');
    for (const entry of ["'db/migrationPlanner'", "'db/migrationRunner'"]) {
      expect(viteConfig, `${entry} must be a rollup input`).toContain(entry);
    }
  });
});

describe('migration safety', () => {
  it('migrations.js swallows no errors', () => {
    // Ten empty catch blocks once made a failed ALTER TABLE indistinguishable
    // from an already-applied one. Every statement is now guarded by
    // inspection; an empty catch here would reintroduce silent failure.
    const source = readFileSync(resolve(dirname, '../../db/migrations.js'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });
});
