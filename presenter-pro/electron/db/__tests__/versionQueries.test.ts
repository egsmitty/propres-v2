import { describe, it, expect } from 'vitest';
import {
  MAX_VERSIONS_PER_PRESENTATION,
  deleteVersionsFor,
  getLatestVersion,
  listVersions,
  writeVersion,
} from '../queries/versions';

// Plan A5 slice 1. Append-only restore points, tested against a fake that
// records every prepared statement and its parameters. better-sqlite3 is never
// instantiated here (its binary is built for Electron's ABI); real database
// behaviour is covered by realSqlite.queries.test.ts and E2E.

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createFakeDb(rows: unknown[] = []) {
  const log: Array<{ sql: string; params: unknown[] }> = [];
  let transactions = 0;
  const db = {
    prepare(sql: string) {
      const text = normalize(sql);
      return {
        run: (...params: unknown[]) => {
          log.push({ sql: text, params });
          return { changes: 1, lastInsertRowid: 1 };
        },
        all: (...params: unknown[]) => {
          log.push({ sql: text, params });
          return rows;
        },
        get: (...params: unknown[]) => {
          log.push({ sql: text, params });
          return rows[0];
        },
      };
    },
    transaction(fn: (...args: unknown[]) => unknown) {
      transactions += 1;
      return (...args: unknown[]) => fn(...args);
    },
  };
  return { db, log, transactionCount: () => transactions };
}

describe('version queries', () => {
  it('writeVersion appends rather than upserting — the list is the point', () => {
    const { db, log } = createFakeDb();
    writeVersion(db, { presentationId: 41, snapshot: '{"id":41}' });

    const insert = log.find((call) => call.sql.includes('INSERT INTO presentation_versions'));
    expect(insert).toBeDefined();
    expect(insert!.sql).not.toContain('ON CONFLICT');
    expect(insert!.params).toEqual([41, '{"id":41}']);
  });

  it('writeVersion runs the insert and the prune in one transaction', () => {
    const { db, transactionCount } = createFakeDb();
    writeVersion(db, { presentationId: 41, snapshot: '{}' });
    expect(transactionCount()).toBe(1);
  });

  it('the prune keeps MAX_VERSIONS_PER_PRESENTATION and is scoped to one presentation', () => {
    const { db, log } = createFakeDb();
    writeVersion(db, { presentationId: 41, snapshot: '{}' });

    const prune = log.find((call) => call.sql.startsWith('DELETE FROM presentation_versions'));
    expect(prune).toBeDefined();
    // Scoped: one document's saves must never prune another's.
    expect(prune!.sql).toContain('presentation_id = ?');
    expect(prune!.params).toEqual([41, 41, MAX_VERSIONS_PER_PRESENTATION]);
    expect(MAX_VERSIONS_PER_PRESENTATION).toBeGreaterThan(1);
  });

  it('getLatestVersion orders by id, never by saved_at', () => {
    const rows = [{ id: 3, presentation_id: 41, snapshot: '{}', saved_at: 9 }];
    const { db, log } = createFakeDb(rows);
    expect(getLatestVersion(db, 41)).toEqual(rows[0]);

    // saved_at is unixepoch() — second resolution. Two saves in the same second
    // would tie and "newest" would be ambiguous. id is monotonic.
    expect(log[0]!.sql).toContain('ORDER BY id DESC');
    expect(log[0]!.sql).not.toContain('ORDER BY saved_at');
    expect(log[0]!.sql).toContain('LIMIT 1');
    expect(log[0]!.params).toEqual([41]);
  });

  it('listVersions is scoped to the presentation and newest first', () => {
    const rows = [{ id: 3 }, { id: 2 }];
    const { db, log } = createFakeDb(rows);
    expect(listVersions(db, 41)).toEqual(rows);
    expect(log[0]!.sql).toContain('WHERE presentation_id = ?');
    expect(log[0]!.sql).toContain('ORDER BY id DESC');
    expect(log[0]!.params).toEqual([41]);
  });

  it('deleteVersionsFor targets exactly the given presentation', () => {
    const { db, log } = createFakeDb();
    deleteVersionsFor(db, 41);
    expect(log).toHaveLength(1);
    expect(log[0]!.sql).toBe('DELETE FROM presentation_versions WHERE presentation_id = ?');
    expect(log[0]!.params).toEqual([41]);
  });
});
