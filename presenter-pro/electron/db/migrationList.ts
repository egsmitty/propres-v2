import type { Migration, MigrationDb } from './migrationPlanner';

/**
 * The schema migrations, in order. Append only; never edit a migration that
 * has shipped. Every `up` is idempotent BY INSPECTION — it checks
 * PRAGMA table_info / IF NOT EXISTS before acting — never by swallowing
 * errors. The runner (`migrationRunner.ts`) applies pending versions each in
 * its own transaction after backing up; the CJS shell `migrations.js` wires
 * the real filesystem and is what the main process requires.
 *
 * This file is TypeScript so the list is typed and unit-testable without the
 * CommonJS shell (whose `require` of .ts modules cannot resolve under Vitest).
 */

/**
 * Statements inside an `up` permitted to fail without aborting the migration.
 * Every entry REQUIRES a comment naming the exact error tolerated and why, and
 * must be reported in the change summary. Do not add entries to make
 * something pass — stop and report instead.
 */
export const TOLERATED_STATEMENT_FAILURES: ReadonlyArray<{
  version: number;
  statement: string;
  reason: string;
}> = [];

/** True when `column` already exists on `table`. Table names are code constants, never user input. */
function hasColumn(db: MigrationDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

/** ALTER TABLE ... ADD COLUMN, guarded by inspection rather than exception. */
function addColumnIfMissing(
  db: MigrationDb,
  table: string,
  column: string,
  definition: string
): void {
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Migration 1 — the schema exactly as it existed before versioning, with the
 * same statements in the same order. The five tables use IF NOT EXISTS; the
 * eight column additions are inspection-guarded; the two indexes use
 * IF NOT EXISTS. Safe to run on ANY database, so a legacy database with no
 * schema_migrations table simply runs it and records it.
 */
function baselineSchema(db: MigrationDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      ccli TEXT,
      tags TEXT,
      slides TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      canonical_path TEXT,
      thumbnail_path TEXT,
      duration INTEGER,
      tags TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS media_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sections TEXT NOT NULL,
      default_background_id INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  addColumnIfMissing(db, 'presentations', 'aspect_ratio', "TEXT DEFAULT '16:9'");
  addColumnIfMissing(db, 'presentations', 'custom_aspect_width', 'INTEGER');
  addColumnIfMissing(db, 'presentations', 'custom_aspect_height', 'INTEGER');
  addColumnIfMissing(db, 'songs', 'song_order', 'TEXT');
  addColumnIfMissing(db, 'songs', 'song_groups', 'TEXT');
  addColumnIfMissing(db, 'songs', 'built_in_key', 'TEXT');
  addColumnIfMissing(db, 'media', 'folder_id', 'INTEGER');
  addColumnIfMissing(db, 'media', 'canonical_path', 'TEXT');

  db.exec('CREATE INDEX IF NOT EXISTS idx_media_canonical_path ON media(canonical_path)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_songs_built_in_key ON songs(built_in_key)');
}

/**
 * Migration 2 — crash-recovery journal (plan A2). One snapshot per
 * presentation while it has unsaved edits; policy in
 * src/utils/recoveryJournal.ts.
 */
function presentationJournal(db: MigrationDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS presentation_journal (
      presentation_id INTEGER PRIMARY KEY,
      snapshot TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      base_updated_at INTEGER
    );
  `);
}

/**
 * Migration 3 — claim legacy built-in hymn rows (plan A3, phase7 #14).
 *
 * Builds that predate `built_in_key` seeded the hymns by title, tagging them
 * "built-in". The seeder now matches by key only, so those rows must be
 * adopted exactly once: set the key on the OLDEST unkeyed row that carries the
 * seeder's own "built-in" tag, and only if no keyed row exists yet. A user's
 * song tagged merely "hymn" is never touched. Nothing is deleted or rewritten.
 *
 * The list is FROZEN here on purpose: a data migration must mean the same
 * thing on every database it ever runs on, even if shared/hymns.json changes.
 */
const MIGRATION_3_BUILT_IN_HYMNS: ReadonlyArray<[key: string, title: string]> = [
  ['amazing-grace', 'Amazing Grace'],
  ['all-creatures-of-our-god-and-king', 'All Creatures of Our God and King'],
  ['how-great-thou-art', 'How Great Thou Art'],
  ['great-is-thy-faithfulness', 'Great Is Thy Faithfulness'],
];

function claimLegacyBuiltInHymns(db: MigrationDb): void {
  const claim = db.prepare(`
    UPDATE songs SET built_in_key = ?
    WHERE built_in_key IS NULL
      AND id = (
        SELECT MIN(id) FROM songs
        WHERE built_in_key IS NULL AND title = ? AND tags LIKE '%"built-in"%'
      )
      AND NOT EXISTS (SELECT 1 FROM songs WHERE built_in_key = ?)
  `);
  for (const [key, title] of MIGRATION_3_BUILT_IN_HYMNS) {
    claim.run(key, title, key);
  }
}

/**
 * Migration 4 (plan A3b): the seeder stamps each built-in hymn with a text
 * fingerprint so it can tell "never edited" from "edited by the user" and
 * refresh only the former. Inspection-guarded like every column add here.
 */
function builtInRevision(db: MigrationDb): void {
  addColumnIfMissing(db, 'songs', 'built_in_revision', 'TEXT');
}

/**
 * Migration 5 — restore points (plan A5). One row per deliberate save, so
 * "Revert to Last Save" has something to revert to once autosave starts
 * writing the live row continuously. Append-only and pruned per presentation;
 * policy in src/utils/presentationVersions.ts, queries in db/queries/versions.js.
 *
 * The index is on (presentation_id, id DESC) because "newest" is resolved by
 * `id`, never by `saved_at` — unixepoch() is second-resolution and two saves in
 * one second would tie.
 */
function presentationVersions(db: MigrationDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS presentation_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      presentation_id INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_presentation_versions_lookup
       ON presentation_versions(presentation_id, id DESC)`
  );
}

export const MIGRATIONS: ReadonlyArray<Migration> = [
  { version: 1, name: 'baseline-schema', up: baselineSchema },
  { version: 2, name: 'presentation-journal', up: presentationJournal },
  { version: 3, name: 'claim-legacy-built-in-hymns', up: claimLegacyBuiltInHymns },
  { version: 4, name: 'built-in-revision', up: builtInRevision },
  { version: 5, name: 'presentation-versions', up: presentationVersions },
];
