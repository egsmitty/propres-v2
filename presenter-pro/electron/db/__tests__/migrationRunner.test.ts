import { describe, it, expect } from 'vitest';
import {
  runMigrations,
  type MigrationDb,
  type BackupStore,
  type PreparedStatement,
} from '../migrationRunner';
import type { Migration } from '../migrationPlanner';

// The runner is the part that destroys data if wrong, so it is tested against
// a fake that records EVERY call in order. The fake implements the minimal
// MigrationDb interface; better-sqlite3 is never instantiated here (its binary
// is built for Electron's ABI and cannot load under Vitest).

const FIXED_NOW = new Date('2026-09-06T15:30:00.000Z');
// Derived from the same fixed Date rather than hand-computed, so it is exact.
const FIXED_UNIX = Math.floor(FIXED_NOW.getTime() / 1000);
const BACKUP_DIR = '/tmp/ppro-backups';

interface Fake {
  db: MigrationDb;
  backups: BackupStore & { removed: string[] };
  /** Every call, in order. Assert on the WHOLE array — order is the point. */
  log: string[];
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createFake(applied: number[], existingBackups: string[] = []): Fake {
  const log: string[] = [];
  const removed: string[] = [];

  const db: MigrationDb = {
    exec(sql) {
      log.push(`exec:${normalize(sql)}`);
    },
    prepare(sql): PreparedStatement {
      const text = normalize(sql);
      return {
        all: () =>
          text.includes('FROM schema_migrations') ? applied.map((version) => ({ version })) : [],
        get: () => undefined,
        run: (...params: unknown[]) => {
          log.push(`run:${text}:[${params.join(',')}]`);
          return undefined;
        },
      };
    },
    transaction<T>(fn: () => T): () => T {
      // Mirrors better-sqlite3: the wrapped call begins, runs, and commits —
      // or rolls back and rethrows when fn throws.
      return () => {
        log.push('BEGIN');
        try {
          const result = fn();
          log.push('COMMIT');
          return result;
        } catch (error) {
          log.push('ROLLBACK');
          throw error;
        }
      };
    },
  };

  const backups = {
    removed,
    list: () => existingBackups.slice(),
    remove: (file: string) => {
      removed.push(file);
      log.push(`remove:${file}`);
    },
  };

  return { db, backups, log };
}

/** A migration whose `up` records itself in the shared log. */
function migration(version: number, log: string[], fail = false): Migration {
  return {
    version,
    name: `m${version}`,
    up: () => {
      log.push(`up:${version}`);
      if (fail) throw new Error(`migration ${version} exploded`);
    },
  };
}

function run(fake: Fake, migrations: Migration[]) {
  return runMigrations(fake.db, migrations, {
    backupDir: BACKUP_DIR,
    backups: fake.backups,
    now: () => FIXED_NOW,
  });
}

describe('runMigrations', () => {
  it('creates the schema_migrations table when absent', () => {
    const fake = createFake([]);
    run(fake, []);
    const creates = fake.log.filter((entry) =>
      entry.startsWith('exec:CREATE TABLE IF NOT EXISTS schema_migrations')
    );
    expect(creates).toHaveLength(1);
  });

  it('applies nothing and takes no backup when every version is applied', () => {
    const fake = createFake([1, 2]);
    const result = run(fake, [migration(1, fake.log), migration(2, fake.log)]);

    expect(result).toEqual({ applied: [], backupPath: null });
    // Exhaustive: nothing but the table-ensure may have happened.
    expect(fake.log).toEqual([
      'exec:CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL )',
    ]);
  });

  it('takes exactly one backup, before the first migration runs', () => {
    const fake = createFake([]);
    run(fake, [migration(1, fake.log), migration(2, fake.log)]);

    const backupIndex = fake.log.findIndex((entry) => entry.startsWith('exec:VACUUM INTO'));
    const firstUpIndex = fake.log.indexOf('up:1');
    expect(backupIndex).toBeGreaterThanOrEqual(0);
    expect(firstUpIndex).toBeGreaterThan(backupIndex);
    expect(fake.log.filter((entry) => entry.startsWith('exec:VACUUM INTO'))).toHaveLength(1);
  });

  it('names the backup with the pre-migration version and a filesystem-safe timestamp', () => {
    const fake = createFake([1]);
    const result = run(fake, [migration(1, fake.log), migration(2, fake.log)]);
    // No colons: this path must be valid on Windows too.
    expect(result.backupPath).toBe(`${BACKUP_DIR}/presenterpro.backup-v1-20260906T153000Z.db`);
    expect(fake.log).toContain(
      `exec:VACUUM INTO '${BACKUP_DIR}/presenterpro.backup-v1-20260906T153000Z.db'`
    );
  });

  it('applies pending migrations in ascending order, recording each after its up inside the same transaction', () => {
    // The list itself must be declared ascending (a misordered list is a
    // programmer error that assertMigrationsWellFormed rejects); the order
    // guarantee under test is the APPLIED order and the exact call sequence.
    const fake = createFake([]);
    const result = run(fake, [migration(1, fake.log), migration(2, fake.log)]);

    expect(result.applied).toEqual([1, 2]);
    // The whole sequence, not a sample of it.
    const afterBackup = fake.log.slice(
      fake.log.findIndex((e) => e.startsWith('exec:VACUUM INTO')) + 1
    );
    expect(afterBackup).toEqual([
      'BEGIN',
      'up:1',
      `run:INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?):[1,m1,${FIXED_UNIX}]`,
      'COMMIT',
      'BEGIN',
      'up:2',
      `run:INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?):[2,m2,${FIXED_UNIX}]`,
      'COMMIT',
    ]);
  });

  it('rolls back a failing migration, records nothing for it, and propagates the error', () => {
    const fake = createFake([1]);
    let thrown: unknown;
    try {
      run(fake, [migration(1, fake.log), migration(2, fake.log, true)]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('migration 2 exploded');

    const afterBackup = fake.log.slice(
      fake.log.findIndex((e) => e.startsWith('exec:VACUUM INTO')) + 1
    );
    expect(afterBackup).toEqual(['BEGIN', 'up:2', 'ROLLBACK']);
  });

  it('does not run later migrations after a failure', () => {
    const fake = createFake([]);
    let thrown: unknown;
    try {
      run(fake, [migration(1, fake.log), migration(2, fake.log, true), migration(3, fake.log)]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(fake.log).toContain('up:2');
    expect(fake.log).not.toContain('up:3');
  });

  it('prunes old backups so at most 3 remain after the new one is written', () => {
    const existing = [
      `${BACKUP_DIR}/presenterpro.backup-v1-20260101T000000Z.db`,
      `${BACKUP_DIR}/presenterpro.backup-v1-20260301T000000Z.db`,
      `${BACKUP_DIR}/presenterpro.backup-v1-20260201T000000Z.db`,
      `${BACKUP_DIR}/presenterpro.backup-v1-20260401T000000Z.db`,
    ];
    const fake = createFake([1], existing);
    run(fake, [migration(1, fake.log), migration(2, fake.log)]);

    // Exactly the two oldest, oldest first — not "some" of them.
    expect(fake.backups.removed).toEqual([
      `${BACKUP_DIR}/presenterpro.backup-v1-20260101T000000Z.db`,
      `${BACKUP_DIR}/presenterpro.backup-v1-20260201T000000Z.db`,
    ]);
  });
});
