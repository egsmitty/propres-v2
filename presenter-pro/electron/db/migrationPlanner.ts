/**
 * Pure version arithmetic for database migrations.
 *
 * No electron, no better-sqlite3, no filesystem — this module only decides
 * *which* migrations apply and validates the list. The shell that executes
 * them is `migrationRunner.ts`, tested through an injected interface.
 */

/** A prepared statement, as much of better-sqlite3's as the runner needs. */
export interface PreparedStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

/**
 * The subset of better-sqlite3's Database the migration system touches. A
 * fake implements this in unit tests; the real Database satisfies it
 * structurally at runtime.
 */
export interface MigrationDb {
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  /** better-sqlite3 signature: wraps `fn` so calling the result runs it in a transaction. */
  transaction<T>(fn: () => T): () => T;
}

export interface Migration {
  /** Unique, ascending, starting at 1. */
  version: number;
  /** Short kebab-case description, recorded in schema_migrations. */
  name: string;
  /**
   * Apply the migration. Must be idempotent BY INSPECTION (check
   * `PRAGMA table_info` / `IF NOT EXISTS` before acting), never by swallowing
   * errors — a failed migration must never look like success.
   */
  up: (db: MigrationDb) => void;
}

/** Highest recorded version; 0 when nothing has been applied. Order-independent. */
export function currentVersion(appliedVersions: readonly number[]): number {
  let highest = 0;
  for (const version of appliedVersions) if (version > highest) highest = version;
  return highest;
}

/**
 * Migrations still to apply, ascending by version. Never includes a version
 * that is already applied, and fills gaps rather than skipping them.
 */
export function selectPendingMigrations(
  appliedVersions: readonly number[],
  migrations: readonly Migration[]
): Migration[] {
  const applied = new Set(appliedVersions);
  return migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version);
}

/** Fail fast on a malformed list: duplicate, non-ascending, or < 1 versions. */
export function assertMigrationsWellFormed(migrations: readonly Migration[]): void {
  const seen = new Set<number>();
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(
        `Migration "${migration.name}" has an invalid version ${migration.version}; versions are integers >= 1`
      );
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version} ("${migration.name}")`);
    }
    if (migration.version <= previous) {
      throw new Error(
        `Migrations must be listed in ascending version order; ${migration.version} ("${migration.name}") follows ${previous}`
      );
    }
    seen.add(migration.version);
    previous = migration.version;
  }
}
