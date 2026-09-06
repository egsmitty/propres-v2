import { describe, it, expect } from 'vitest';
import {
  currentVersion,
  selectPendingMigrations,
  assertMigrationsWellFormed,
  type Migration,
} from '../migrationPlanner';

// Pure version arithmetic for the migration runner. Nothing here touches
// SQLite; that is deliberate — see migrationRunner.test.ts for the shell.

const noop = () => undefined;
const m = (version: number, name = `m${version}`): Migration => ({ version, name, up: noop });

describe('currentVersion', () => {
  it('is 0 when nothing has been applied', () => {
    expect(currentVersion([])).toBe(0);
  });

  it('is the highest applied version', () => {
    expect(currentVersion([1, 2, 3])).toBe(3);
  });

  it('does not depend on input order', () => {
    expect(currentVersion([3, 1, 2])).toBe(3);
  });
});

describe('selectPendingMigrations', () => {
  const all = [m(1), m(2), m(3)];

  it('returns pending migrations ascending by version', () => {
    // Order and count both matter: this is the order SQL runs in.
    const pending = selectPendingMigrations([], [m(3), m(1), m(2)]);
    expect(pending.map((x) => x.version)).toEqual([1, 2, 3]);
  });

  it('never returns an already-applied version', () => {
    const pending = selectPendingMigrations([1, 2], all);
    expect(pending.map((x) => x.version)).toEqual([3]);
  });

  it('returns an empty list when everything is applied', () => {
    expect(selectPendingMigrations([1, 2, 3], all)).toEqual([]);
  });

  it('fills a gap rather than skipping it', () => {
    // A database that somehow recorded 1 and 3 must still get 2.
    const pending = selectPendingMigrations([1, 3], all);
    expect(pending.map((x) => x.version)).toEqual([2]);
  });
});

describe('assertMigrationsWellFormed', () => {
  it('throws on duplicate versions', () => {
    let thrown: unknown;
    try {
      assertMigrationsWellFormed([m(1), m(2), m(2, 'dup')]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toMatch(/duplicate/i);
  });

  it('throws on non-ascending versions', () => {
    let thrown: unknown;
    try {
      assertMigrationsWellFormed([m(2), m(1)]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toMatch(/ascending/i);
  });
});
