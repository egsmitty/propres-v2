import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIGRATIONS } from '../migrationList';
import { BACKUP_FILE_PATTERN, runMigrations, type BackupStore } from '../migrationRunner';
import type { MigrationDb } from '../migrationPlanner';
import {
  LEGACY_PRESENTATION_TITLE,
  LEGACY_SONG_TITLE,
  columnsOf,
  openLegacyMemoryDb,
  tablesOf,
  type RealDb,
} from './helpers/realDb';

// Plan A4: the migration runner + the real migration list, end to end, on the
// legacy schema, with real SQLite and a real backup directory. The E2E proves
// the same through the app in ~40 s; this proves it in milliseconds and pins
// the details (backup contents, no-op second run) precisely.

/** Exactly what the legacy fixture lacks and the current schema has. Exhaustive. */
const COLUMNS_LEGACY_LACKS: ReadonlyArray<[table: string, column: string]> = [
  ['presentations', 'custom_aspect_width'],
  ['presentations', 'custom_aspect_height'],
  ['songs', 'song_groups'],
  ['songs', 'built_in_key'],
  ['songs', 'built_in_revision'],
  ['media', 'folder_id'],
  ['media', 'canonical_path'],
];

function realBackupStore(dir: string): BackupStore {
  return {
    list: () =>
      readdirSync(dir)
        .filter((f) => BACKUP_FILE_PATTERN.test(f))
        .map((f) => join(dir, f)),
    remove: (file) => unlinkSync(file),
  };
}

let db: RealDb;
let dir: string;
const FIXED_NOW = () => new Date('2026-09-06T12:00:00Z');

beforeEach(() => {
  db = openLegacyMemoryDb();
  dir = mkdtempSync(join(tmpdir(), 'presenterpro-a4-'));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function run() {
  return runMigrations(db as unknown as MigrationDb, MIGRATIONS, {
    backupDir: dir,
    backups: realBackupStore(dir),
    now: FIXED_NOW,
  });
}

describe('migration runner on the legacy schema (real SQLite)', () => {
  it('applies exactly 1–5, records them, and adds every column the legacy schema lacks', () => {
    const result = run();
    expect(result.applied).toEqual([1, 2, 3, 4, 5]);
    expect(
      db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all()
    ).toEqual([
      { version: 1, name: 'baseline-schema' },
      { version: 2, name: 'presentation-journal' },
      { version: 3, name: 'claim-legacy-built-in-hymns' },
      { version: 4, name: 'built-in-revision' },
      { version: 5, name: 'presentation-versions' },
    ]);
    for (const [table, column] of COLUMNS_LEGACY_LACKS) {
      expect(columnsOf(db, table), `${table}.${column}`).toContain(column);
    }
    expect(tablesOf(db)).toEqual([
      'media',
      'media_folders',
      'presentation_journal',
      'presentation_versions',
      'presentations',
      'schema_migrations',
      'settings',
      'songs',
    ]);
  });

  it('writes one backup that is the UNTOUCHED legacy database: legacy rows present, no schema_migrations, no new columns', () => {
    const { backupPath } = run();
    expect(backupPath).toBe(join(dir, 'presenterpro.backup-v0-20260906T120000Z.db'));
    const backup = new Database(backupPath!, { readonly: true });
    try {
      expect(tablesOf(backup)).toEqual(['media', 'presentations', 'settings', 'songs']);
      expect(columnsOf(backup, 'songs')).not.toContain('built_in_key');
      expect(backup.prepare('SELECT title FROM presentations').all()).toEqual([
        { title: LEGACY_PRESENTATION_TITLE },
      ]);
      expect(backup.prepare('SELECT COUNT(*) AS n FROM songs').get()).toEqual({ n: 3 });
    } finally {
      backup.close();
    }
  });

  it('keeps user data intact and migration 3 claims the old-seeder hymn by key while leaving the user’s hymn alone', () => {
    run();
    expect(db.prepare('SELECT title FROM presentations').all()).toEqual([
      { title: LEGACY_PRESENTATION_TITLE },
    ]);
    const rows = db
      .prepare("SELECT id, tags, built_in_key FROM songs WHERE title = 'Amazing Grace' ORDER BY id")
      .all() as Array<{ id: number; tags: string; built_in_key: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.built_in_key).toBe('amazing-grace'); // older row, tagged built-in
    expect(rows[1]!.built_in_key).toBeNull(); // the user's own, tagged hymn only
    expect(
      db.prepare('SELECT title FROM songs WHERE built_in_key IS NULL AND tags IS NULL').all()
    ).toEqual([{ title: LEGACY_SONG_TITLE }]);
  });

  it('a second run applies nothing and writes no second backup', () => {
    run();
    const before = readdirSync(dir);
    const second = run();
    expect(second).toEqual({ applied: [], backupPath: null });
    expect(readdirSync(dir)).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 5 });
  });
});
