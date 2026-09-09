import { describe, it, expect } from 'vitest';
import { listJournals, deleteJournal } from '../queries/journal';

// Query module for the crash-recovery journal, tested against a fake that
// records every prepared statement and its parameters. better-sqlite3 is never
// instantiated here (its binary is built for Electron's ABI).

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createFakeDb(rows: unknown[] = []) {
  const log: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const text = normalize(sql);
      return {
        run: (...params: unknown[]) => {
          log.push({ sql: text, params });
          return { changes: 1 };
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
  };
  return { db, log };
}

describe('journal queries', () => {
  it('listJournals returns every row with the columns the policy needs', () => {
    const rows = [{ presentation_id: 1, snapshot: '{}', saved_at: 9, base_updated_at: 8 }];
    const { db, log } = createFakeDb(rows);
    expect(listJournals(db)).toEqual(rows);
    expect(log[0]!.sql).toContain('FROM presentation_journal');
    for (const column of ['presentation_id', 'snapshot', 'saved_at', 'base_updated_at']) {
      expect(log[0]!.sql).toContain(column);
    }
  });

  it('deleteJournal targets exactly the given presentation', () => {
    const { db, log } = createFakeDb();
    deleteJournal(db, 41);
    expect(log).toHaveLength(1);
    expect(log[0]!.sql).toContain('DELETE FROM presentation_journal WHERE presentation_id = ?');
    expect(log[0]!.params).toEqual([41]);
  });
});
