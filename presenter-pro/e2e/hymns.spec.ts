import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { test, expect, launchApp, closeApp, dismissTutorialIfPresent } from './fixtures/launchApp';

// Plan A3b: a user's edit to a built-in hymn must survive relaunch, and saving
// or editing a built-in must never cause the seeder to create a duplicate.

const SEED_SETTLE_MS = 3_000;
const HYMN_KEYS = [
  'amazing-grace',
  'all-creatures-of-our-god-and-king',
  'how-great-thou-art',
  'great-is-thy-faithfulness',
];

function dbPathIn(dir: string): string {
  return path.join(dir, 'presenterpro.db');
}
function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

test.describe('built-in hymns', () => {
  test('a user edit to a built-in hymn survives relaunch and is never duplicated', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    const db = dbPathIn(dir);
    try {
      await dismissTutorialIfPresent(first.window);
      await first.window.waitForTimeout(SEED_SETTLE_MS);

      // All four hymns seeded, keyed, and stamped — exact set.
      const seeded = query<{ built_in_key: string; built_in_revision: string | null }>(
        db,
        'SELECT built_in_key, built_in_revision FROM songs WHERE built_in_key IS NOT NULL ORDER BY built_in_key'
      );
      expect(seeded.map((r) => r.built_in_key)).toEqual([...HYMN_KEYS].sort());
      expect(
        seeded.every(
          (r) => typeof r.built_in_revision === 'string' && r.built_in_revision.length === 8
        )
      ).toBe(true);
    } finally {
      await closeApp(first, { keepUserData: true });
    }

    // Note: a fresh profile also contains the main process's SAMPLE song titled
    // "Amazing Grace" (electron/main/index.js seed(), unkeyed). Duplicates are
    // therefore detected by total row count and by key, never by title.
    const countSongs = () => query<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM songs')[0]!.n;
    const songsBefore = countSongs();

    // The user edits the built-in Amazing Grace: change the first slide's text.
    // Done directly in the database, as the song editor's save would (which
    // also does not touch the stamped revision — that is the point).
    const [row] = query<{ id: number; song_groups: string }>(
      db,
      "SELECT id, song_groups FROM songs WHERE built_in_key = 'amazing-grace'"
    );
    const groups = JSON.parse(row!.song_groups) as Array<{ slides: Array<{ body: string }> }>;
    groups[0]!.slides[0]!.body = 'MY OWN ARRANGEMENT of the first line';
    const edited = JSON.stringify(groups).replace(/'/g, "''");
    execFileSync('sqlite3', [
      db,
      `UPDATE songs SET song_groups = '${edited}' WHERE id = ${row!.id}`,
    ]);

    const second = await launchApp({ userDataDir: dir });
    try {
      await second.window.waitForTimeout(SEED_SETTLE_MS);

      // No row was added or removed, exactly one row carries the key, and it
      // is the same row with the edit intact.
      expect(countSongs()).toBe(songsBefore);
      const after = query<{ id: number; song_groups: string }>(
        db,
        "SELECT id, song_groups FROM songs WHERE built_in_key = 'amazing-grace'"
      );
      expect(after).toHaveLength(1);
      expect(after[0]!.id).toBe(row!.id);
      expect(after[0]!.song_groups).toContain('MY OWN ARRANGEMENT of the first line');
    } finally {
      await closeApp(second);
    }
  });
});
