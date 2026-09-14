import { describe, it, expect, vi, afterEach } from 'vitest';
import path, { resolve } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

// `electron/db/index.js` does `const { app } = require('electron')` at the
// top, but calls nothing on `app` at module scope — only inside `getDb()`.
// Under plain Node/Vitest, `require('electron')` resolves to a path string
// (not the Electron module object), so `app` is `undefined` here; that is
// harmless as long as the functions under test never touch it. MAIN-B11 /
// MAIN-B14: `getDbPath`/`resolveDbFileName` are pure for exactly this reason
// — so the dev-vs-packaged path decision is unit-testable without Electron.
import * as dbIndex from '../index';

// MAIN-B14 is about `npm run dev` sharing the installed app's database, and
// only the electron-vite dev server sets ELECTRON_RENDERER_URL. Keying the
// file on `app.isPackaged` instead (this plan's first version) also moved
// `npm run preview` and Playwright E2E — both unpackaged — to the -dev file,
// while every E2E spec reads userData/presenterpro.db: "no such table:
// presentations". electron/main/index.js records the same lesson for renderer
// loading (rendererLoading.test.ts).
describe('resolveDbFileName (MAIN-B14)', () => {
  it('uses presenterpro.db without the dev server (packaged app, preview, E2E)', () => {
    expect(dbIndex.resolveDbFileName(false)).toBe('presenterpro.db');
  });

  it('uses a -dev suffixed file under the dev server, so npm run dev never touches the installed app database', () => {
    expect(dbIndex.resolveDbFileName(true)).toBe('presenterpro-dev.db');
  });
});

describe('getDbPath (MAIN-B14)', () => {
  it('joins the userData directory with presenterpro.db without the dev server', () => {
    expect(dbIndex.getDbPath('/Users/x/Library/Application Support/PresenterPro', false)).toBe(
      path.join('/Users/x/Library/Application Support/PresenterPro', 'presenterpro.db')
    );
  });

  it('joins the userData directory with the dev filename under the dev server', () => {
    expect(dbIndex.getDbPath('/Users/x/Library/Application Support/PresenterPro', true)).toBe(
      path.join('/Users/x/Library/Application Support/PresenterPro', 'presenterpro-dev.db')
    );
  });
});

describe('getDb chooses the file by the dev server, not by packaging (MAIN-B14)', () => {
  const source = readFileSync(resolve(dirname, '../index.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('reads ELECTRON_RENDERER_URL to decide', () => {
    expect(code).toMatch(
      /getDbPath\(\s*app\.getPath\('userData'\),\s*Boolean\(process\.env\.ELECTRON_RENDERER_URL\)\s*\)/
    );
  });

  it('never keys the database file on app.isPackaged', () => {
    expect(code).not.toContain('isPackaged');
  });
});

describe('closeDb (MAIN-B11)', () => {
  afterEach(() => {
    dbIndex.__setDbForTesting(undefined);
  });

  it('checkpoints the WAL then closes the handle, in that order', () => {
    const calls: string[] = [];
    const fakeDb = {
      pragma: vi.fn((arg: string) => calls.push(`pragma:${arg}`)),
      close: vi.fn(() => calls.push('close')),
    };
    dbIndex.__setDbForTesting(fakeDb);

    dbIndex.closeDb();

    expect(calls).toEqual(['pragma:wal_checkpoint(TRUNCATE)', 'close']);
  });

  it('is a no-op on a second call — the handle is checkpointed and closed exactly once', () => {
    const fakeDb = { pragma: vi.fn(), close: vi.fn() };
    dbIndex.__setDbForTesting(fakeDb);

    dbIndex.closeDb();
    dbIndex.closeDb();

    expect(fakeDb.pragma).toHaveBeenCalledTimes(1);
    expect(fakeDb.close).toHaveBeenCalledTimes(1);
  });

  it('never throws when the checkpoint fails, and still logs the error — quit must not hang or crash', () => {
    const fakeDb = {
      pragma: vi.fn(() => {
        throw new Error('disk unavailable');
      }),
      close: vi.fn(),
    };
    dbIndex.__setDbForTesting(fakeDb);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown: unknown;
    try {
      dbIndex.closeDb();
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('is a no-op when no database was ever opened', () => {
    dbIndex.__setDbForTesting(undefined);
    expect(() => dbIndex.closeDb()).not.toThrow();
  });
});
