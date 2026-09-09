import { describe, it, expect } from 'vitest';
import { deletePresentation } from '../queries/presentations';

// Plan A5 slice 1. Deleting a presentation must take its restore points with
// it — an append-only table that is never cleaned is a slow disk leak — and it
// takes the journal row too, closing a pre-existing orphan leak (A2 relied on
// selectRecoverable calling those rows `presentation-missing` at some later
// launch).

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createFakeDb() {
  const log: Array<{ sql: string; params: unknown[] }> = [];
  let transactions = 0;
  const db = {
    prepare(sql: string) {
      const text = normalize(sql);
      return {
        run: (...params: unknown[]) => {
          log.push({ sql: text, params });
          return { changes: 1 };
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

/** The table each DELETE targets, in the order the statements ran. */
function deletedTables(log: Array<{ sql: string }>): string[] {
  return log
    .map((call) => /^DELETE FROM (\w+)/.exec(call.sql)?.[1])
    .filter((name): name is string => Boolean(name));
}

describe('deletePresentation', () => {
  it('deletes the presentation and both of its dependent tables', () => {
    const { db, log } = createFakeDb();
    deletePresentation(db, 41);

    // Count AND membership matter: a missing table is an orphan leak, and an
    // extra one would be deleting something this plan never authorised.
    expect(new Set(deletedTables(log))).toEqual(
      new Set(['presentations', 'presentation_versions', 'presentation_journal'])
    );
    expect(deletedTables(log)).toHaveLength(3);
    for (const call of log) {
      expect(call.params).toEqual([41]);
    }
  });

  it('runs the three deletes in one transaction', () => {
    const { db, transactionCount } = createFakeDb();
    deletePresentation(db, 41);
    expect(transactionCount()).toBe(1);
  });
});
