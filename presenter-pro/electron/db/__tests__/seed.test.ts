import { describe, it, expect } from 'vitest';
import { openMigratedMemoryDb, type RealDb } from './helpers/realDb';
import { seed } from '../seed';

// MAIN-B10. Real SQLite (plan A4 exception: `seed.js` has no electron
// dependency, so a real in-memory db at the current schema proves the
// transaction actually rolls back — a fake db.transaction() could only ever
// prove it was CALLED, not that a mid-seed crash leaves nothing behind).

function countsOf(db: RealDb) {
  return {
    songs: (db.prepare('SELECT COUNT(*) AS n FROM songs').get() as { n: number }).n,
    presentations: (db.prepare('SELECT COUNT(*) AS n FROM presentations').get() as { n: number }).n,
    initialized: db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get() as
      { value: string } | undefined,
  };
}

describe('seed', () => {
  it('seeds exactly 3 songs, 1 presentation, and marks initialized on an empty database', () => {
    const db = openMigratedMemoryDb();
    seed(db as never);
    const counts = countsOf(db);
    expect(counts.songs).toBe(3);
    expect(counts.presentations).toBe(1);
    expect(counts.initialized?.value).toBe('true');
    db.close();
  });

  it('is a no-op when the database is already initialized', () => {
    const db = openMigratedMemoryDb();
    db.prepare("INSERT INTO settings (key, value) VALUES ('initialized', 'true')").run();
    seed(db as never);
    const counts = countsOf(db);
    // Exact zero — nothing was inserted on top of the pre-existing flag.
    expect(counts.songs).toBe(0);
    expect(counts.presentations).toBe(0);
    db.close();
  });

  it('rolls back every write when a mid-seed insert throws — no orphaned songs, no presentation, no initialized flag', () => {
    const db = openMigratedMemoryDb();

    // Patch the REAL db instance (not a module mock — CommonJS `require`
    // inside seed.js/queries/songs.js is not reliably interceptable by
    // vi.mock in this codebase, and this patch exercises the actual
    // better-sqlite3 transaction/rollback behaviour end to end). Fail the
    // second `INSERT INTO songs`, letting the first genuinely commit its
    // statement before the transaction as a whole is rolled back.
    const realPrepare = db.prepare.bind(db);
    let songInserts = 0;
    db.prepare = ((sql: string) => {
      const stmt = realPrepare(sql);
      if (!sql.trim().startsWith('INSERT INTO songs')) return stmt;
      const realRun = stmt.run.bind(stmt);
      return {
        ...stmt,
        run: (...args: unknown[]) => {
          songInserts += 1;
          if (songInserts === 2) throw new Error('disk full mid-seed');
          return realRun(...args);
        },
      };
    }) as typeof db.prepare;

    let thrown: unknown;
    try {
      seed(db as never);
    } catch (e) {
      thrown = e;
    }
    db.prepare = realPrepare;

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('disk full mid-seed');

    const counts = countsOf(db);
    // The first `INSERT INTO songs` DID run before the throw on the second —
    // if the whole seed is one transaction, that first insert is rolled back
    // too. This is the assertion MAIN-B10 exists for.
    expect(counts.songs).toBe(0);
    expect(counts.presentations).toBe(0);
    expect(counts.initialized).toBeUndefined();

    db.close();
  });
});
