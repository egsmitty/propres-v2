import {
  assertMigrationsWellFormed,
  currentVersion,
  selectPendingMigrations,
  type Migration,
  type MigrationDb,
} from './migrationPlanner';

export type { Migration, MigrationDb, PreparedStatement } from './migrationPlanner';

/**
 * Filesystem seam for backup pruning, injected so the runner never reads the
 * disk directly and can be tested with a fake.
 */
export interface BackupStore {
  /** Absolute paths of existing backup files in the backup directory. */
  list(): string[];
  remove(file: string): void;
}

export interface RunOptions {
  /** Directory the backup is written to — normally the database's own directory. */
  backupDir: string;
  backups: BackupStore;
  /** Injected clock, so timestamps are testable. */
  now?: () => Date;
  /** Newest backups to retain after this run, including the one just written. Default 3. */
  keepBackups?: number;
}

export interface RunResult {
  /** Versions applied by this run, ascending. Empty when nothing was pending. */
  applied: number[];
  /** Path of the backup written before applying, or null when nothing was pending. */
  backupPath: string | null;
}

const DEFAULT_KEEP_BACKUPS = 3;

/** Matches backup files this runner writes. Exported so the store can filter by it. */
export const BACKUP_FILE_PATTERN = /^presenterpro\.backup-v(\d+)-(\d{8}T\d{6}Z)\.db$/;

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )
`;

/**
 * Compact ISO-8601 with no separators: `20260906T153000Z`. Colons are illegal
 * in Windows filenames, so the standard `toISOString()` form cannot be used.
 * Fixed width, so lexicographic order is chronological order.
 */
function fileSafeTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Single-quote a path for an SQL string literal. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function timestampOf(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? '';
  const match = BACKUP_FILE_PATTERN.exec(name);
  return match?.[2] ?? '';
}

/**
 * Delete the oldest backups so that after the new one is written at most
 * `keep` remain. Removes oldest-first.
 */
function pruneBackups(store: BackupStore, keep: number): void {
  const retainExisting = Math.max(0, keep - 1);
  const existing = store
    .list()
    .filter((file) => timestampOf(file) !== '')
    .sort((a, b) => timestampOf(b).localeCompare(timestampOf(a))); // newest first
  const stale = existing.slice(retainExisting).reverse(); // oldest first
  for (const file of stale) store.remove(file);
}

/**
 * Apply every pending migration, in order, each in its own transaction.
 *
 * Behaviour, in order — all six, exhaustive:
 *  1. Validate the migration list (throws on a malformed list).
 *  2. Ensure `schema_migrations` exists.
 *  3. Read applied versions; compute pending.
 *  4. Nothing pending → return; no backup is taken.
 *  5. Otherwise back up the database BEFORE any migration runs (`VACUUM INTO`,
 *     which is consistent under WAL because it reads through a normal
 *     transaction — unlike copying the file), then prune to `keepBackups`.
 *  6. For each pending migration, in one transaction: run `up`, then record
 *     the version. A throw rolls that transaction back, records nothing for
 *     it, and propagates. Later migrations do not run.
 *
 * Synchronous on purpose: the main process calls this before creating any
 * window, and better-sqlite3's `backup()` is async, which would force the
 * whole startup sequence to change. `VACUUM INTO` gives the same guarantee
 * without that.
 *
 * There is deliberately no error handling here. A failed migration must
 * surface loudly at startup, never be mistaken for success.
 */
export function runMigrations(
  db: MigrationDb,
  migrations: readonly Migration[],
  options: RunOptions
): RunResult {
  const now = options.now ?? (() => new Date());
  const keep = options.keepBackups ?? DEFAULT_KEEP_BACKUPS;

  assertMigrationsWellFormed(migrations);
  db.exec(ENSURE_TABLE_SQL);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number;
  }>;
  const appliedVersions = appliedRows.map((row) => row.version);
  const pending = selectPendingMigrations(appliedVersions, migrations);

  if (pending.length === 0) {
    return { applied: [], backupPath: null };
  }

  const timestamp = now();
  const backupPath = `${options.backupDir}/presenterpro.backup-v${currentVersion(appliedVersions)}-${fileSafeTimestamp(timestamp)}.db`;
  pruneBackups(options.backups, keep);
  db.exec(`VACUUM INTO ${sqlString(backupPath)}`);

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );
  const appliedAt = Math.floor(timestamp.getTime() / 1000);
  const applied: number[] = [];

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      record.run(migration.version, migration.name, appliedAt);
    });
    apply();
    applied.push(migration.version);
  }

  return { applied, backupPath };
}
