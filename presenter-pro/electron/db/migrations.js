const fs = require('fs');
const path = require('path');
const { runMigrations: run, BACKUP_FILE_PATTERN } = require('./migrationRunner');

// Versioned schema migrations.
//
// Each migration runs once, in its own transaction, and is recorded in
// `schema_migrations`. A backup (VACUUM INTO) is written before any migration
// applies. Every `up` is idempotent BY INSPECTION — it checks PRAGMA
// table_info / IF NOT EXISTS before acting — never by swallowing errors. The
// previous scheme wrapped ten ALTER TABLEs in empty catch blocks, which made
// "already applied" indistinguishable from "disk full" or "database locked":
// a failed migration reported success.
//
// Migration 1 is safe to run on ANY database, so a legacy database with no
// schema_migrations table simply runs it (finds everything present, changes
// nothing) and records it. There is no baseline special case to get wrong.

/**
 * Statements inside an `up` permitted to fail without aborting the migration.
 * Every entry REQUIRES a comment naming the exact error tolerated and why, and
 * must be reported in the change summary. Do not add entries to make
 * something pass — stop and report instead.
 */
const TOLERATED_STATEMENT_FAILURES = [];

/** True when `column` already exists on `table`. Table names are code constants, never user input. */
function hasColumn(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

/** ALTER TABLE ... ADD COLUMN, guarded by inspection rather than exception. */
function addColumnIfMissing(db, table, column, definition) {
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Migration 1 — the schema exactly as it existed before versioning, with the
 * same statements in the same order. The five tables use IF NOT EXISTS; the
 * eight column additions are inspection-guarded; the two indexes use
 * IF NOT EXISTS.
 */
function baselineSchema(db) {
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

/** Ordered list. Append only; never edit a migration that has shipped. */
const MIGRATIONS = [{ version: 1, name: 'baseline-schema', up: baselineSchema }];

/** Real filesystem implementation of the runner's BackupStore seam. */
function createBackupStore(dir) {
  return {
    list: () =>
      fs
        .readdirSync(dir)
        .filter((file) => BACKUP_FILE_PATTERN.test(file))
        .map((file) => path.join(dir, file)),
    remove: (file) => fs.unlinkSync(file),
  };
}

/**
 * Bring `db` up to date. Synchronous: the main process calls this during
 * `ready`, before any window exists, and a failure here must surface at
 * startup rather than be swallowed.
 */
function runMigrations(db) {
  const backupDir = path.dirname(db.name);
  return run(db, MIGRATIONS, { backupDir, backups: createBackupStore(backupDir) });
}

module.exports = { runMigrations, MIGRATIONS, TOLERATED_STATEMENT_FAILURES };
