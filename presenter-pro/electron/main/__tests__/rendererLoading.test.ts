import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Mechanical guard for plan P2, pitfall 0.
//
// The main process used to decide how to load the renderer with
// `isDev = !app.isPackaged` and a hardcoded `http://localhost:5173`. That
// breaks every launch that is unpackaged but not served by the dev server:
// Playwright E2E (launches out/main/index.js) and `npm run preview`. Both
// would try to reach a dev server that is not running.
//
// The electron-vite convention is the fix: `electron-vite dev` sets
// `process.env.ELECTRON_RENDERER_URL`; nothing else does. Load from it when
// present, else from the built file. This test pins that convention so the
// hardcoding cannot come back.

const dirname = fileURLToPath(new URL('.', import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(dirname, '../index.js'), 'utf8');

/** Strip comments so a comment *explaining* the old URL cannot trip the test. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CODE = stripComments(MAIN_SOURCE);

describe('renderer loading follows the electron-vite convention', () => {
  it('contains no hardcoded dev-server URL', () => {
    // The exact string that broke unpackaged launches.
    expect(CODE).not.toContain('localhost:5173');
  });

  it('reads the renderer URL from ELECTRON_RENDERER_URL', () => {
    expect(CODE).toContain('process.env.ELECTRON_RENDERER_URL');
  });

  it('does not gate renderer loading on app.isPackaged', () => {
    // `isPackaged` is the wrong question — it is false for E2E and preview,
    // both of which must load the BUILT renderer. Only the preload-path
    // resolution may still consult it; loadURL/loadFile must not.
    const loadSites = CODE.split('\n').filter((line) => /\.(loadURL|loadFile)\(/.test(line));
    // Structural floor: the three windows (main, output, stage) each load
    // twice (URL branch + file branch) — fewer than 6 sites means a window
    // lost its loader, not that the code got cleaner.
    expect(loadSites.length).toBeGreaterThanOrEqual(6);

    const gatedOnIsPackaged = CODE.split('\n').filter(
      (line) => /if\s*\(\s*isDev\s*\)/.test(line) && /load/.test(line)
    );
    expect(gatedOnIsPackaged).toEqual([]);
  });

  it('keeps the output and stage-display hashes on both branches', () => {
    // The secondary windows are routed by URL hash (see src/App.jsx). Losing a
    // hash on either the URL or the file branch renders the wrong window.
    for (const hash of ['/output', '/stage-display']) {
      const occurrences = CODE.split(hash).length - 1;
      expect(occurrences, `hash ${hash} must appear on the URL and file branches`).toBe(2);
    }
  });
});
