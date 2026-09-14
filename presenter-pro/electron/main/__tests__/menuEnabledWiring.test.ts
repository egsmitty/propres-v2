import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Plan CMDS1 PR B. `electron/main/index.js` cannot be imported in a unit test
// (it boots Electron), so its wiring is pinned by reading the source: the
// `menu:setEnabled` listener exists, and its body sets `enabled` on the menu
// item found by id. `App.jsx` starts the renderer side once, on mount.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

const here = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(resolve(here, '../index.js'), 'utf8');
const APP = readFileSync(resolve(here, '../../../src/App.jsx'), 'utf8');

function handlerBody(source: string, channel: string): string {
  const start = source.indexOf(`ipc.on('${channel}'`);
  expect(start, `${channel} listener not found in index.js`).toBeGreaterThanOrEqual(0);
  // The body runs to the next top-level registration.
  const next = source.indexOf('\n  ipc.', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('main applies the enabled map to the native menu', () => {
  it('registers menu:setEnabled through the registry and sets item.enabled by id', () => {
    const body = handlerBody(MAIN, 'menu:setEnabled');
    expect(body).toContain('Menu.getApplicationMenu()');
    expect(body).toContain('getMenuItemById(');
    expect(body).toMatch(/\.enabled = Boolean\(/);
  });
});

describe('the renderer starts the sync once', () => {
  it('App.jsx imports startNativeMenuSync and calls it from an effect', () => {
    expect(APP).toContain("import { startNativeMenuSync } from '@/utils/nativeMenuSync';");
    expect(APP).toMatch(
      /React\.useEffect\(\(\) => \{\s*return startNativeMenuSync\(\);\s*\}, \[\]\);/
    );
  });
});
