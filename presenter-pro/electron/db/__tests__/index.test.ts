import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';

// `electron/db/index.js` does `const { app } = require('electron')` at the
// top, but calls nothing on `app` at module scope — only inside `getDb()`.
// Under plain Node/Vitest, `require('electron')` resolves to a path string
// (not the Electron module object), so `app` is `undefined` here; that is
// harmless as long as the functions under test never touch it. MAIN-B11 /
// MAIN-B14: `getDbPath`/`resolveDbFileName` are pure for exactly this reason
// — so the dev-vs-packaged path decision is unit-testable without Electron.
import * as dbIndex from '../index';

describe('resolveDbFileName (MAIN-B14)', () => {
  it('uses presenterpro.db when packaged', () => {
    expect(dbIndex.resolveDbFileName(true)).toBe('presenterpro.db');
  });

  it('uses a -dev suffixed file when not packaged, so dev and the installed app never share a database', () => {
    expect(dbIndex.resolveDbFileName(false)).toBe('presenterpro-dev.db');
  });
});

describe('getDbPath (MAIN-B14)', () => {
  it('joins the userData directory with the packaged filename', () => {
    expect(dbIndex.getDbPath('/Users/x/Library/Application Support/PresenterPro', true)).toBe(
      path.join('/Users/x/Library/Application Support/PresenterPro', 'presenterpro.db')
    );
  });

  it('joins the userData directory with the dev filename when unpackaged', () => {
    expect(dbIndex.getDbPath('/Users/x/Library/Application Support/PresenterPro', false)).toBe(
      path.join('/Users/x/Library/Application Support/PresenterPro', 'presenterpro-dev.db')
    );
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
