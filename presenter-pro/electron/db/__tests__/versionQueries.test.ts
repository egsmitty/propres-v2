import { describe, it, expect } from 'vitest';
import {
  deleteVersionsFor,
  getLatestVersion,
  getVersion,
  listVersionSummaries,
  listVersions,
  writeVersion,
} from '../queries/versions';
import { versionsToPrune } from '../versionRetention';

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

  it('deletes exactly the ids the retention policy names, and nothing else', () => {
    // BEHAVIOUR CHANGE (plan A6): retention is time-thinned, not "keep the last
    // 25". The query no longer decides anything — it asks versionsToPrune and
    // deletes what it is told, so the calendar logic stays pure and testable.
    const NOW = new Date(2026, 8, 11, 14, 0, 0, 0).getTime();
    const dayAgo = Math.floor(NOW / 1000) - 86_400;
    const rows = [
      { id: 1, saved_at: dayAgo },
      { id: 2, saved_at: dayAgo + 60 },
      { id: 3, saved_at: Math.floor(NOW / 1000) - 60 },
    ];
    const expected = versionsToPrune(rows, NOW);
    expect(expected.length).toBeGreaterThan(0); // the fixture must exercise pruning

    const { db, log } = createFakeDb(rows);
    writeVersion(db, { presentationId: 41, snapshot: '{}' }, NOW);

    const prune = log.find((call) => call.sql.startsWith('DELETE FROM presentation_versions'));
    expect(prune).toBeDefined();
    expect(prune!.params).toEqual(expected);
  });

  it("reads the presentation's own rows before pruning, scoped by id", () => {
    // One document's saves must never prune another's.
    const { db, log } = createFakeDb([{ id: 1, saved_at: 1 }]);
    writeVersion(db, { presentationId: 41, snapshot: '{}' });
    const read = log.find((call) => call.sql.includes('SELECT id, saved_at'));
    expect(read).toBeDefined();
    expect(read!.sql).toContain('WHERE presentation_id = ?');
    expect(read!.params).toEqual([41]);
  });

  it('issues no DELETE when nothing needs pruning', () => {
    const { db, log } = createFakeDb([{ id: 1, saved_at: Math.floor(Date.now() / 1000) }]);
    writeVersion(db, { presentationId: 41, snapshot: '{}' });
    expect(log.some((call) => call.sql.startsWith('DELETE'))).toBe(false);
  });

  it('getVersion selects one row by its own id, with the snapshot', () => {
    const row = { id: 3, presentation_id: 41, snapshot: '{"a":1}', saved_at: 9 };
    const { db, log } = createFakeDb([row]);
    expect(getVersion(db, 3)).toEqual(row);
    expect(log[0]!.sql).toContain('WHERE id = ?');
    expect(log[0]!.params).toEqual([3]);
    // The restore path needs presentation_id to check the row belongs to the
    // open document, so it must be selected.
    expect(log[0]!.sql).toContain('presentation_id');
  });

  it('listVersionSummaries returns counts WITHOUT shipping snapshots', () => {
    const rows = [{ id: 3, saved_at: 9, slide_count: 12 }];
    const { db, log } = createFakeDb(rows);
    expect(listVersionSummaries(db, 41)).toEqual(rows);

    // A snapshot is ~1.1KB per slide; listing 40 versions of an 80-slide set
    // would push ~3.6MB across IPC just to render a number. The snapshot may be
    // READ inside json_each to count slides, but must never be RETURNED, so
    // strip the json_each call and require no mention survives.
    const returned = log[0]!.sql.replace(/json_each\([^)]*\)/g, '');
    expect(returned).not.toContain('snapshot');
    expect(log[0]!.sql).toContain('json_array_length');
    expect(log[0]!.sql).toContain('ORDER BY id DESC');
    expect(log[0]!.params).toEqual([41]);
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
