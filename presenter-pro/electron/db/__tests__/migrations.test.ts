import { describe, it, expect } from 'vitest';
import { MIGRATIONS, TOLERATED_STATEMENT_FAILURES } from '../migrationList';
import { assertMigrationsWellFormed, type Migration } from '../migrationPlanner';

// The migration LIST, as shipped. Migration 3 (plan A3) is the first data
// migration: it claims rows the pre-key seeder wrote, by setting built_in_key,
// and must never delete or rewrite anything else.

const FROZEN_HYMNS: ReadonlyArray<[key: string, title: string]> = [
  ['amazing-grace', 'Amazing Grace'],
  ['all-creatures-of-our-god-and-king', 'All Creatures of Our God and King'],
  ['how-great-thou-art', 'How Great Thou Art'],
  ['great-is-thy-faithfulness', 'Great Is Thy Faithfulness'],
];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createFakeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const execs: string[] = [];
  const db = {
    exec(sql: string) {
      execs.push(normalize(sql));
    },
    prepare(sql: string) {
      const text = normalize(sql);
      return {
        run: (...params: unknown[]) => {
          runs.push({ sql: text, params });
          return { changes: 0 };
        },
        all: () => [],
        get: () => undefined,
      };
    },
    transaction<T>(fn: () => T) {
      return () => fn();
    },
  };
  return { db, runs, execs };
}

const migrations = MIGRATIONS as Migration[];

describe('MIGRATIONS list', () => {
  it('is exactly versions 1, 2, 3, 4 and well-formed', () => {
    expect(migrations.map((m) => m.version)).toEqual([1, 2, 3, 4]);
    expect(() => assertMigrationsWellFormed(migrations)).not.toThrow();
  });

  it('names migration 3 claim-legacy-built-in-hymns', () => {
    expect(migrations[2]?.name).toBe('claim-legacy-built-in-hymns');
  });

  it('has no tolerated statement failures', () => {
    expect(TOLERATED_STATEMENT_FAILURES).toEqual([]);
  });
});

describe('migration 3 — claim legacy built-in hymns', () => {
  it('issues exactly one UPDATE per frozen hymn with params [key, title, key], in order', () => {
    const { db, runs, execs } = createFakeDb();
    migrations[2]!.up(db as never);

    expect(execs).toEqual([]); // no DDL, no raw exec
    expect(runs.map((r) => r.params)).toEqual(
      FROZEN_HYMNS.map(([key, title]) => [key, title, key])
    );
  });

  it('only sets built_in_key on an unkeyed, built-in-tagged row when no keyed row exists — and never deletes', () => {
    const { db, runs } = createFakeDb();
    migrations[2]!.up(db as never);

    expect(runs).toHaveLength(FROZEN_HYMNS.length);
    for (const { sql } of runs) {
      expect(sql).toMatch(/^UPDATE songs SET built_in_key = \?/);
      expect(sql).toContain('WHERE built_in_key IS NULL');
      expect(sql).toContain('SELECT MIN(id) FROM songs');
      expect(sql).toContain(`tags LIKE '%"built-in"%'`);
      expect(sql).toContain('NOT EXISTS (SELECT 1 FROM songs WHERE built_in_key = ?)');
      expect(sql).not.toMatch(/DELETE|DROP|INSERT/i);
    }
  });
});

describe('migration 4 — built_in_revision column', () => {
  function fakeWithColumns(columns: string[]) {
    const execs: string[] = [];
    const db = {
      exec(sql: string) {
        execs.push(normalize(sql));
      },
      prepare() {
        return {
          all: () => columns.map((name) => ({ name })),
          run: () => undefined,
          get: () => undefined,
        };
      },
      transaction<T>(fn: () => T) {
        return () => fn();
      },
    };
    return { db, execs };
  }

  it('is named built-in-revision', () => {
    expect(migrations[3]?.name).toBe('built-in-revision');
  });

  it('adds songs.built_in_revision when absent — by inspection, not exception', () => {
    const { db, execs } = fakeWithColumns(['id', 'title']);
    migrations[3]!.up(db as never);
    expect(execs).toEqual(['ALTER TABLE songs ADD COLUMN built_in_revision TEXT']);
  });

  it('does nothing when the column already exists', () => {
    const { db, execs } = fakeWithColumns(['id', 'title', 'built_in_revision']);
    migrations[3]!.up(db as never);
    expect(execs).toEqual([]);
  });
});
