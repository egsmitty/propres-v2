import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openMigratedMemoryDb, type RealDb } from './helpers/realDb';
import * as songs from '../queries/songs';
import * as presentations from '../queries/presentations';
import * as media from '../queries/media';
import * as journal from '../queries/journal';

// Plan A4: the query modules against REAL SQLite at the current schema. The
// fake-db tests pin SQL text; these prove the statements do what the text says.

type Row = Record<string, unknown>;
const q = <T = Row>(db: RealDb, sql: string, ...params: unknown[]) =>
  db.prepare(sql).all(...params) as T[];

let db: RealDb;
beforeEach(() => {
  db = openMigratedMemoryDb();
});
afterEach(() => {
  db.close();
});

describe('songs', () => {
  const create = (fields: Row) =>
    (songs.createSong as unknown as (db: RealDb, f: Row) => Row)(db, { slides: '[]', ...fields });
  const update = (id: unknown, fields: Row) =>
    (songs.updateSong as unknown as (db: RealDb, id: unknown, f: Row) => Row)(db, id, {
      slides: '[]',
      ...fields,
    });

  it('creates and reads back with camelCase aliases for the snake_case columns', () => {
    const row = create({
      title: 'Amazing Grace',
      builtInKey: 'amazing-grace',
      builtInRevision: 'abcd1234',
      songGroups: '[{"type":"verse"}]',
    });
    expect(row).toMatchObject({
      title: 'Amazing Grace',
      built_in_key: 'amazing-grace',
      builtInKey: 'amazing-grace',
      builtInRevision: 'abcd1234',
      songGroups: '[{"type":"verse"}]',
    });
  });

  it('updateSong PRESERVES built_in_key and built_in_revision when the caller omits them (the song editor path)', () => {
    const created = create({
      title: 'Amazing Grace',
      builtInKey: 'amazing-grace',
      builtInRevision: 'r1',
    });
    const after = update(created.id, { title: 'Amazing Grace (edited)' });
    expect(after).toMatchObject({
      title: 'Amazing Grace (edited)',
      builtInKey: 'amazing-grace',
      builtInRevision: 'r1',
    });
  });

  it('updateSong SETS both when the caller supplies them (the seeder path)', () => {
    const created = create({
      title: 'Amazing Grace',
      builtInKey: 'amazing-grace',
      builtInRevision: 'r1',
    });
    const after = update(created.id, {
      title: 'Amazing Grace',
      builtInKey: 'amazing-grace',
      builtInRevision: 'r2',
    });
    expect(after.builtInRevision).toBe('r2');
  });

  it('getSongByBuiltInKey finds by key and returns null for unknown or empty keys', () => {
    create({ title: 'Amazing Grace', builtInKey: 'amazing-grace' });
    expect((songs.getSongByBuiltInKey(db, 'amazing-grace') as Row).title).toBe('Amazing Grace');
    expect(songs.getSongByBuiltInKey(db, 'nope')).toBeNull();
    expect(songs.getSongByBuiltInKey(db, '')).toBeNull();
  });

  it('getSongs orders by title and deleteSong removes exactly that row', () => {
    const b = create({ title: 'B song' });
    create({ title: 'a song' });
    create({ title: 'C song' });
    expect((songs.getSongs(db) as Row[]).map((s) => s.title)).toEqual([
      'B song',
      'C song',
      'a song',
    ]); // SQLite ASC is byte order
    songs.deleteSong(db, b.id);
    expect((songs.getSongs(db) as Row[]).map((s) => s.title)).toEqual(['C song', 'a song']);
  });
});

describe('presentations', () => {
  const create = (fields: Row) =>
    (presentations.createPresentation as unknown as (db: RealDb, f: Row) => Row)(db, fields);

  it('creates with defaults: sections stored as JSON, aspect ratio 16:9, custom sizes null', () => {
    const row = create({ title: 'Sunday' });
    expect(row).toMatchObject({
      title: 'Sunday',
      sections: [],
      aspectRatio: '16:9',
      customAspectWidth: null,
      customAspectHeight: null,
      defaultBackgroundId: null,
    });
    expect(q(db, 'SELECT sections FROM presentations')[0]!.sections).toBe('[]');
  });

  it('round-trips sections as parsed objects and accepts both camelCase and snake_case fields', () => {
    const sections = [{ id: 's1', title: 'Opening', slides: [] }];
    const a = create({
      title: 'A',
      sections,
      customAspectWidth: 4,
      customAspectHeight: 3,
      aspectRatio: 'custom',
    });
    const b = create({
      title: 'B',
      sections,
      custom_aspect_width: 4,
      custom_aspect_height: 3,
      aspect_ratio: 'custom',
    });
    expect(a.sections).toEqual(sections);
    expect([a, b].map((r) => [r.aspectRatio, r.customAspectWidth, r.customAspectHeight])).toEqual([
      ['custom', 4, 3],
      ['custom', 4, 3],
    ]);
  });

  it('updatePresentation replaces every field and getPresentation returns null for a missing id', () => {
    const row = create({ title: 'A', sections: [{ id: 'x' }] });
    const after = (
      presentations.updatePresentation as unknown as (db: RealDb, id: unknown, f: Row) => Row
    )(db, row.id, { title: 'A2', sections: [], aspectRatio: '4:3' });
    expect(after).toMatchObject({ title: 'A2', sections: [], aspectRatio: '4:3' });
    expect(presentations.getPresentation(db, 999)).toBeNull();
  });

  it('getPresentations lists most recently updated first', () => {
    const older = create({ title: 'older' });
    const newer = create({ title: 'newer' });
    db.prepare('UPDATE presentations SET updated_at = ? WHERE id = ?').run(1000, older.id);
    db.prepare('UPDATE presentations SET updated_at = ? WHERE id = ?').run(2000, newer.id);
    expect((presentations.getPresentations(db) as Row[]).map((p) => p.title)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('touchPresentation bumps updated_at and deletePresentation removes the row', () => {
    const row = create({ title: 'T' });
    db.prepare('UPDATE presentations SET updated_at = 1 WHERE id = ?').run(row.id);
    const touched = presentations.touchPresentation(db, row.id) as Row;
    expect(touched.updated_at as number).toBeGreaterThan(1);
    presentations.deletePresentation(db, row.id);
    expect(presentations.getPresentations(db)).toEqual([]);
  });
});

describe('media and folders', () => {
  const folder = (name: string) => media.createMediaFolder(db, { name }) as Row;
  const item = (fields: Row) =>
    (media.createMedia as unknown as (db: RealDb, f: Row) => Row)(db, {
      name: 'x.png',
      type: 'image',
      file_path: '/x.png',
      ...fields,
    });

  it('createMedia stores nulls for the optional columns it is not given', () => {
    const row = item({});
    expect(row).toMatchObject({
      name: 'x.png',
      type: 'image',
      file_path: '/x.png',
      canonical_path: null,
      thumbnail_path: null,
      duration: null,
      tags: null,
      folder_id: null,
    });
  });

  it('updateMedia merges a partial update over the existing row', () => {
    const row = item({ tags: '["a"]' });
    const after = media.updateMedia(db, row.id, { name: 'renamed.png' }) as Row;
    expect(after).toMatchObject({ name: 'renamed.png', tags: '["a"]', file_path: '/x.png' });
    expect(media.updateMedia(db, 999, { name: 'ghost' })).toBeNull();
  });

  it('getMediaFolders sorts case-insensitively by name', () => {
    folder('beta');
    folder('Alpha');
    folder('gamma');
    expect((media.getMediaFolders(db) as Row[]).map((f) => f.name)).toEqual([
      'Alpha',
      'beta',
      'gamma',
    ]);
  });

  it('deleteMediaFolder removes the folder AND every media row inside it, in one transaction', () => {
    const f = folder('Backgrounds');
    item({ name: 'in-folder-1', folder_id: f.id });
    item({ name: 'in-folder-2', folder_id: f.id });
    item({ name: 'loose' });
    media.deleteMediaFolder(db, f.id);
    expect(media.getMediaFolders(db)).toEqual([]);
    expect((media.getMedia(db) as Row[]).map((m) => m.name)).toEqual(['loose']);
  });

  it('updateMediaFolder renames and returns null for a missing folder', () => {
    const f = folder('Old');
    expect((media.updateMediaFolder(db, f.id, { name: 'New' }) as Row).name).toBe('New');
    expect(media.updateMediaFolder(db, 999, { name: 'x' })).toBeNull();
  });
});

describe('presentation journal (legacy rows only)', () => {
  // Plan A5 slice 3 removed `writeJournal`, so rows are seeded with raw SQL —
  // which is exactly the state these readers now exist for: journals left in a
  // profile by a pre-autosave build, drained once on the next launch.
  const seed = (presentationId: number, snapshot: string, baseUpdatedAt: number | null = null) =>
    db
      .prepare(
        `INSERT INTO presentation_journal (presentation_id, snapshot, saved_at, base_updated_at)
         VALUES (?, ?, unixepoch(), ?)`
      )
      .run(presentationId, snapshot, baseUpdatedAt);

  it('lists every seeded row with the columns the policy needs', () => {
    seed(7, '{"v":2}', 200);
    const rows = journal.listJournals(db) as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      presentation_id: 7,
      snapshot: '{"v":2}',
      base_updated_at: 200,
    });
    expect(rows[0]!.saved_at as number).toBeGreaterThan(0);
  });

  it('lists rows for several presentations, with a null base timestamp preserved', () => {
    seed(1, 'a');
    seed(2, 'b');
    expect((journal.listJournals(db) as Row[]).map((r) => r.presentation_id).sort()).toEqual([
      1, 2,
    ]);
    expect(
      (journal.listJournals(db) as Row[]).find((r) => r.presentation_id === 1)!.base_updated_at
    ).toBeNull();
  });

  it('deleteJournal removes only that presentation’s row', () => {
    seed(1, 'a');
    seed(2, 'b');
    journal.deleteJournal(db, 1);
    expect((journal.listJournals(db) as Row[]).map((r) => r.presentation_id)).toEqual([2]);
  });
});
