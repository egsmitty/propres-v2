import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  test,
  expect,
  launchApp,
  closeApp,
  FATAL_STDERR_MARKERS,
  type LaunchedApp,
} from './fixtures/launchApp';

// Plan A1's data-safety verification, made repeatable. Unit tests prove the
// runner's logic against a fake; these prove the REAL app, on REAL SQLite,
// against a fresh database, a pre-versioning legacy database, a second
// launch, and backup pruning. Nothing here touches a real profile — every
// launch uses a throwaway userData directory (see the fixture).
//
// The database is inspected from outside the app with the sqlite3 CLI, which
// is present on macOS (where E2E runs). better-sqlite3 cannot load in the
// test process (Electron ABI).

const BACKUP_FILE = /^presenterpro\.backup-v\d+-(\d{8}T\d{6}Z)\.db$/;

function dbPathIn(userDataDir: string): string {
  return path.join(userDataDir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

function listBackups(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => BACKUP_FILE.test(f))
    .sort();
}

function columnsOf(dbFile: string, table: string): string[] {
  return query<{ name: string }>(dbFile, `PRAGMA table_info(${table})`).map((r) => r.name);
}

/**
 * A database as an OLD build left it: no schema_migrations, no media_folders
 * table at all (mirrors a real dev-mode database found on the maintainer's
 * machine), and missing several of the later ALTER TABLE columns. Seeded with
 * one presentation and one song so data integrity can be asserted.
 */
const LEGACY_PRESENTATION_TITLE = 'Legacy Sunday Service';
const LEGACY_SONG_TITLE = 'Legacy Hymn';
const LEGACY_DDL = `
  CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, artist TEXT, ccli TEXT, tags TEXT, slides TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT NOT NULL, file_path TEXT NOT NULL,
    thumbnail_path TEXT, duration INTEGER, tags TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE presentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, sections TEXT NOT NULL, default_background_id INTEGER,
    created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ALTER TABLE presentations ADD COLUMN aspect_ratio TEXT DEFAULT '16:9';
  ALTER TABLE songs ADD COLUMN song_order TEXT;
  INSERT INTO presentations (title, sections) VALUES ('${LEGACY_PRESENTATION_TITLE}', '[]');
  INSERT INTO songs (title, slides) VALUES ('${LEGACY_SONG_TITLE}', '[]');
  -- Every real database carries this: the app writes it on first run and
  -- seeds sample content only when it is absent. Without it the fixture would
  -- be LESS realistic than any real installation, and the seeded sample rows
  -- would make user-data assertions fail for the wrong reason.
  INSERT INTO settings (key, value) VALUES ('initialized', 'true');
`;

function createLegacyDb(userDataDir: string): void {
  execFileSync('sqlite3', [dbPathIn(userDataDir)], { input: LEGACY_DDL });
}

/**
 * Legacy database that ALSO holds two "Amazing Grace" rows, as an old build
 * could leave them: one the old seeder wrote (tagged "built-in", no key —
 * the column did not exist yet) and one the user imported themselves, tagged
 * only "hymn". Migration 3 must claim the first and never touch the second;
 * the key-only seeder must then create nothing extra.
 */
const USER_HYMN_TAGS = '["hymn"]';
const OLD_SEEDER_TAGS = '["hymn","public-domain","built-in"]';
function createLegacyDbWithHymns(userDataDir: string): void {
  createLegacyDb(userDataDir);
  execFileSync('sqlite3', [dbPathIn(userDataDir)], {
    input: `
      INSERT INTO songs (title, slides, tags) VALUES ('Amazing Grace', '[]', '${OLD_SEEDER_TAGS}');
      INSERT INTO songs (title, slides, tags) VALUES ('Amazing Grace', '[]', '${USER_HYMN_TAGS}');
    `,
  });
}

/** Columns migration 1 must ADD to the legacy database above. Exhaustive for that fixture. */
const COLUMNS_LEGACY_LACKS: ReadonlyArray<[table: string, column: string]> = [
  ['presentations', 'custom_aspect_width'],
  ['presentations', 'custom_aspect_height'],
  ['songs', 'song_groups'],
  ['songs', 'built_in_key'],
  ['media', 'folder_id'],
  ['media', 'canonical_path'],
];

async function expectNoFatalStderr(launched: LaunchedApp): Promise<void> {
  await launched.window.waitForLoadState('load');
  const stderr = launched.stderr();
  const present = FATAL_STDERR_MARKERS.filter((m) => stderr.includes(m));
  expect(present, `fatal markers in stderr:\n${stderr}`).toEqual([]);
}

test.describe('database migrations', () => {
  test('fresh install: creates the schema and records exactly migrations 1, 2 and 3', async ({
    launched,
  }) => {
    await expectNoFatalStderr(launched);
    const db = dbPathIn(launched.userDataDir);

    expect(query(db, 'SELECT version, name FROM schema_migrations ORDER BY version')).toEqual([
      { version: 1, name: 'baseline-schema' },
      { version: 2, name: 'presentation-journal' },
      { version: 3, name: 'claim-legacy-built-in-hymns' },
    ]);
    // All six application tables exist, by exact name (presentation_journal
    // arrived with migration 2 — a behaviour-change edit to this expectation).
    expect(
      query<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name"
      ).map((r) => r.name)
    ).toEqual([
      'media',
      'media_folders',
      'presentation_journal',
      'presentations',
      'settings',
      'songs',
    ]);
  });

  test('legacy database: upgraded in place, data intact, one backup written', async () => {
    const launched = await launchApp({ prepareUserData: createLegacyDb });
    try {
      await expectNoFatalStderr(launched);
      const dir = launched.userDataDir;
      const db = dbPathIn(dir);

      // Recorded as versions 1, 2 and 3 without a baseline special case.
      expect(query(db, 'SELECT version, name FROM schema_migrations')).toEqual([
        { version: 1, name: 'baseline-schema' },
        { version: 2, name: 'presentation-journal' },
        { version: 3, name: 'claim-legacy-built-in-hymns' },
      ]);

      // The missing table was created and every missing column added by
      // inspection — the exact set, not a sample.
      expect(
        query<{ name: string }>(
          db,
          "SELECT name FROM sqlite_master WHERE type='table' AND name='media_folders'"
        )
      ).toHaveLength(1);
      const stillMissing = COLUMNS_LEGACY_LACKS.filter(
        ([table, column]) => !columnsOf(db, table).includes(column)
      );
      expect(stillMissing).toEqual([]);

      // User data survived, exactly — nothing lost. Two seeding paths exist:
      // main's seed() is gated by settings.initialized (the fixture carries
      // it, so it does not run), and the renderer's built-in hymn seeding
      // (App.jsx → ensureBuiltInSongsSeeded) runs asynchronously after the
      // window loads, inserting rows keyed by built_in_key over ~1s. This
      // query may land mid-seeding, so it filters to user rows — the
      // NULL-keyed ones — which makes it independent of that race. The
      // seeding feature itself is not under test here.
      expect(query(db, 'SELECT title FROM presentations')).toEqual([
        { title: LEGACY_PRESENTATION_TITLE },
      ]);
      expect(query(db, 'SELECT title FROM songs WHERE built_in_key IS NULL')).toEqual([
        { title: LEGACY_SONG_TITLE },
      ]);

      // Exactly one backup, taken BEFORE the migration: it must still have the
      // legacy shape and contain the same user data.
      const backups = listBackups(dir);
      expect(backups).toHaveLength(1);
      const backup = path.join(dir, backups[0]!);
      expect(
        query(backup, "SELECT name FROM sqlite_master WHERE name='schema_migrations'")
      ).toEqual([]);
      expect(query(backup, "SELECT name FROM sqlite_master WHERE name='media_folders'")).toEqual(
        []
      );
      expect(query(backup, 'SELECT title FROM presentations')).toEqual([
        { title: LEGACY_PRESENTATION_TITLE },
      ]);
      expect(query(backup, 'SELECT title FROM songs')).toEqual([{ title: LEGACY_SONG_TITLE }]);
    } finally {
      await closeApp(launched);
    }
  });

  test('second launch is a no-op: no new backup, no re-applied migration', async () => {
    const first = await launchApp({ prepareUserData: createLegacyDb });
    const dir = first.userDataDir;
    try {
      await expectNoFatalStderr(first);
      expect(listBackups(dir)).toHaveLength(1);
    } finally {
      await closeApp(first, { keepUserData: true });
    }

    const second = await launchApp({ userDataDir: dir });
    try {
      await expectNoFatalStderr(second);
      expect(query(dbPathIn(dir), 'SELECT version FROM schema_migrations')).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
      ]);
      // Still exactly the one backup from the first launch.
      expect(listBackups(dir)).toHaveLength(1);
    } finally {
      await closeApp(second);
    }
  });

  test('backup pruning keeps the newest three', async () => {
    const stale = [
      'presenterpro.backup-v0-20250101T000000Z.db',
      'presenterpro.backup-v0-20250201T000000Z.db',
      'presenterpro.backup-v0-20250301T000000Z.db',
      'presenterpro.backup-v0-20250401T000000Z.db',
    ];
    const launched = await launchApp({
      prepareUserData: (dir) => {
        createLegacyDb(dir);
        for (const name of stale) fs.writeFileSync(path.join(dir, name), '');
      },
    });
    try {
      await expectNoFatalStderr(launched);
      const remaining = listBackups(launched.userDataDir);
      expect(remaining).toHaveLength(3);
      // The two newest stale ones survive alongside the new backup; the two
      // oldest are gone. Exact membership, not a count alone.
      expect(remaining.slice(0, 2)).toEqual([stale[2], stale[3]]);
      expect(remaining[2]).toMatch(/^presenterpro\.backup-v0-\d{8}T\d{6}Z\.db$/);
      expect(remaining).not.toContain(stale[0]);
      expect(remaining).not.toContain(stale[1]);
    } finally {
      await closeApp(launched);
    }
  });
  test('legacy hymn rows: migration 3 claims the old seeder row by key and leaves the user song alone', async () => {
    const launched = await launchApp({ prepareUserData: createLegacyDbWithHymns });
    try {
      await expectNoFatalStderr(launched);
      // The renderer's key-only seeder runs ~1s after load; let it settle so
      // the assertion also proves it created nothing extra.
      await launched.window.waitForTimeout(3_000);
      const db = dbPathIn(launched.userDataDir);

      const rows = query<{ id: number; built_in_key: string | null; tags: string }>(
        db,
        "SELECT id, built_in_key, tags FROM songs WHERE title = 'Amazing Grace' ORDER BY id"
      );
      // Exactly two: the old-seeder row (older id) now keyed, the user's row
      // untouched. No third row from the seeder, nothing deleted.
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        id: rows[0]!.id,
        built_in_key: 'amazing-grace',
        tags: OLD_SEEDER_TAGS,
      });
      expect(rows[1]).toEqual({ id: rows[1]!.id, built_in_key: null, tags: USER_HYMN_TAGS });
      expect(rows[0]!.id).toBeLessThan(rows[1]!.id);

      // The user's other song survived too.
      expect(query(db, "SELECT title FROM songs WHERE title = 'Legacy Hymn'")).toEqual([
        { title: LEGACY_SONG_TITLE },
      ]);
    } finally {
      await closeApp(launched);
    }
  });
});
