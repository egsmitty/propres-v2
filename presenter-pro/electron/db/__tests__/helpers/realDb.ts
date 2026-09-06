import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../migrationList';
import type { MigrationDb } from '../../migrationPlanner';

// Real SQLite for unit tests (plan A4). better-sqlite3 13 is N-API, so the
// same binary that ships in the app loads under Node in Vitest.

export type RealDb = Database.Database;

/** An in-memory database at the CURRENT schema: every migration applied in order. */
export function openMigratedMemoryDb(): RealDb {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) migration.up(db as unknown as MigrationDb);
  return db;
}

export const LEGACY_PRESENTATION_TITLE = 'Legacy Sunday';
export const LEGACY_SONG_TITLE = 'Legacy Song';
export const OLD_SEEDER_TAGS = '["hymn","public-domain","built-in"]';
export const USER_HYMN_TAGS = '["hymn"]';

/**
 * The schema an installation from before versioned migrations carries —
 * verbatim the fixture `e2e/migrations.spec.ts` uses, so the unit and E2E
 * proofs are about the same database.
 */
export const LEGACY_DDL = `
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
  INSERT INTO songs (title, slides, tags) VALUES ('Amazing Grace', '[]', '${OLD_SEEDER_TAGS}');
  INSERT INTO songs (title, slides, tags) VALUES ('Amazing Grace', '[]', '${USER_HYMN_TAGS}');
  INSERT INTO settings (key, value) VALUES ('initialized', 'true');
`;

/** An in-memory database in the legacy shape above, untouched by any migration. */
export function openLegacyMemoryDb(): RealDb {
  const db = new Database(':memory:');
  db.exec(LEGACY_DDL);
  return db;
}

export function columnsOf(db: RealDb, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
}

export function tablesOf(db: RealDb): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map((t) => t.name);
}
