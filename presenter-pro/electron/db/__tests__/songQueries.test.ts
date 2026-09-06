import { describe, it, expect } from 'vitest';
import * as songQueries from '../queries/songs';

// A3b: the song editor's save does not pass builtInKey or builtInRevision.
// Before this change updateSong wrote `built_in_key = ?` with null, so saving
// an edited built-in hymn silently de-keyed it and the seeder re-created a
// duplicate on the next launch. Both columns must be PRESERVED when a caller
// omits them, and set when it supplies them.

// The JS query module destructures its payload, so TS infers every key as
// required; real callers pass partial objects. Type the functions as they are used.
type SongFields = Record<string, unknown>;
type FakeDb = { prepare: (sql: string) => unknown };
const updateSong = songQueries.updateSong as unknown as (
  db: FakeDb,
  id: number,
  fields: SongFields
) => unknown;
const createSong = songQueries.createSong as unknown as (db: FakeDb, fields: SongFields) => unknown;
const payload = (fields: SongFields): SongFields => fields;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createFakeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const text = normalize(sql);
      return {
        run: (...params: unknown[]) => {
          runs.push({ sql: text, params });
          return { lastInsertRowid: 1, changes: 1 };
        },
        get: () => ({ id: 1 }),
        all: () => [],
      };
    },
  };
  return { db, runs };
}

describe('updateSong', () => {
  it('preserves built_in_key and built_in_revision when the caller omits them', () => {
    const { db, runs } = createFakeDb();
    updateSong(db, 7, payload({ title: 'Amazing Grace', slides: '[]' }));

    const update = runs.find((r) => r.sql.startsWith('UPDATE songs'))!;
    expect(update.sql).toContain('built_in_key = COALESCE(?, built_in_key)');
    expect(update.sql).toContain('built_in_revision = COALESCE(?, built_in_revision)');
    // Params: title, artist, ccli, tags, slides, song_order, song_groups, key, revision, id
    expect(update.params).toEqual([
      'Amazing Grace',
      null,
      null,
      null,
      '[]',
      null,
      null,
      null,
      null,
      7,
    ]);
  });

  it('sets both when the caller supplies them', () => {
    const { db, runs } = createFakeDb();
    updateSong(
      db,
      7,
      payload({
        title: 'Amazing Grace',
        slides: '[]',
        builtInKey: 'amazing-grace',
        builtInRevision: 'abcd1234',
      })
    );
    const update = runs.find((r) => r.sql.startsWith('UPDATE songs'))!;
    expect(update.params.slice(7, 9)).toEqual(['amazing-grace', 'abcd1234']);
  });
});

describe('createSong', () => {
  it('writes built_in_revision alongside built_in_key', () => {
    const { db, runs } = createFakeDb();
    createSong(
      db,
      payload({
        title: 'Amazing Grace',
        slides: '[]',
        builtInKey: 'amazing-grace',
        builtInRevision: 'abcd1234',
      })
    );
    const insert = runs.find((r) => r.sql.startsWith('INSERT INTO songs'))!;
    expect(insert.sql).toContain('built_in_key, built_in_revision');
    expect(insert.params.slice(-2)).toEqual(['amazing-grace', 'abcd1234']);
  });
});
