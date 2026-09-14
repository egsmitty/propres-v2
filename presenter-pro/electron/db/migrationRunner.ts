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

/**
 * Thrown when the database's recorded schema version is higher than any
 * migration this build knows about — i.e. the database was written by a
 * newer build of PresenterPro. A distinct class (rather than a generic
 * `Error`) so a future startup dialog (MAIN-B1) can catch it by type instead
 * of parsing the message; the message itself still carries the literal
 * phrase "created by a newer version of PresenterPro" for a string-matching
 * caller. Thrown before any backup or migration runs — refusing to touch a
 * database this build does not fully understand.
 */
export class NewerSchemaVersionError extends Error {
  constructor(dbVersion: number, highestKnownVersion: number) {
    super(
      `This database was created by a newer version of PresenterPro (schema v${dbVersion}); ` +
        `this build only recognizes up to v${highestKnownVersion}. Refusing to touch it.`
    );
    this.name = 'NewerSchemaVersionError';
  }
}

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
 * Behaviour, in order — all seven, exhaustive:
 *  1. Validate the migration list (throws on a malformed list).
 *  2. Read applied versions — only if `schema_migrations` exists (checked via
 *     sqlite_master); otherwise none. Nothing is written yet.
 *  3. Refuse a database whose recorded version is higher than any migration
 *     this build knows (MAIN-B12) — `NewerSchemaVersionError`, before any
 *     backup or migration. Without this, a newer-than-us database has
 *     nothing "pending" and step 4 would silently return as if fine.
 *  4. Compute pending. Nothing pending → return with ZERO writes: no table
 *     creation, no backup.
 *  5. Prune old backups, then back up the still-untouched database
 *     (`VACUUM INTO`, consistent under WAL because it reads through a normal
 *     transaction — unlike copying the file). The backup is therefore exactly
 *     what the user had, with no trace of this system in it.
 *  6. Ensure `schema_migrations` exists.
 *  7. For each pending migration, in one transaction: run `up`, then record
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

  const trackingTableExists =
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get() !== undefined;
  const appliedVersions = trackingTableExists
    ? (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
        (row) => row.version
      )
    : [];
  const dbVersion = currentVersion(appliedVersions);
  const highestKnownVersion = currentVersion(migrations.map((migration) => migration.version));
  if (dbVersion > highestKnownVersion) {
    throw new NewerSchemaVersionError(dbVersion, highestKnownVersion);
  }

  const pending = selectPendingMigrations(appliedVersions, migrations);

  if (pending.length === 0) {
    return { applied: [], backupPath: null };
  }

  const timestamp = now();
  const backupPath = `${options.backupDir}/presenterpro.backup-v${currentVersion(appliedVersions)}-${fileSafeTimestamp(timestamp)}.db`;
  pruneBackups(options.backups, keep);
  db.exec(`VACUUM INTO ${sqlString(backupPath)}`);

  db.exec(ENSURE_TABLE_SQL);

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
