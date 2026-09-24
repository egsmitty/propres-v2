import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openMigratedMemoryDb, type RealDb } from './helpers/realDb';
import * as media from '../queries/media';

// Plan #155-P1: the media library gains nested folders (parent_id). These pin
// the data layer — create-under-a-parent, rename-keeps-parent, move,
// move-to-root, recursive descendants, a recursive cascade delete, and
// cycle-safety — against real SQLite. RED on current code: there is no
// `parent_id` column, `createMediaFolder` ignores `parentId`, and
// `getMediaFolderDescendants` does not exist.

type Row = Record<string, unknown>;

let db: RealDb;
beforeEach(() => {
  db = openMigratedMemoryDb();
});
afterEach(() => {
  db.close();
});

const folder = (name: string, parentId?: number | null) =>
  media.createMediaFolder(db, { name, parentId }) as Row;
const item = (fields: Row) =>
  (media.createMedia as unknown as (dbArg: RealDb, f: Row) => Row)(db, {
    name: 'x.png',
    type: 'image',
    file_path: '/x.png',
    ...fields,
  });
const folderRow = (id: unknown) =>
  db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id) as Row | undefined;
const folderIds = () => (media.getMediaFolders(db) as Row[]).map((f) => f.id);

describe('media_folders nesting (plan #155-P1)', () => {
  it('migration 6 adds a parent_id column to media_folders', () => {
    const columns = (db.prepare('PRAGMA table_info(media_folders)').all() as Row[]).map(
      (c) => c.name
    );
    expect(columns).toContain('parent_id');
  });

  it('createMediaFolder stores the given parent and defaults to root (null)', () => {
    const root = folder('Backgrounds');
    expect(folderRow(root.id)?.parent_id).toBeNull();

    const child = folder('Sunday', root.id as number);
    expect(folderRow(child.id)?.parent_id).toBe(root.id);
  });

  it('updateMediaFolder rename preserves the parent; move changes only the parent', () => {
    const root = folder('Backgrounds');
    const child = folder('Sunday', root.id as number);
    const other = folder('Midweek');

    media.updateMediaFolder(db, child.id, { name: 'Sunday AM' });
    expect(folderRow(child.id)).toMatchObject({ name: 'Sunday AM', parent_id: root.id });

    media.updateMediaFolder(db, child.id, { parentId: other.id as number });
    expect(folderRow(child.id)).toMatchObject({ name: 'Sunday AM', parent_id: other.id });
  });

  it('updateMediaFolder moves a folder back to root when parent_id is null', () => {
    const root = folder('Backgrounds');
    const child = folder('Sunday', root.id as number);

    media.updateMediaFolder(db, child.id, { parent_id: null });
    expect(folderRow(child.id)?.parent_id).toBeNull();
  });

  it('getMediaFolderDescendants returns every descendant and excludes the folder itself', () => {
    const root = folder('Backgrounds');
    const child = folder('Sunday', root.id as number);
    const grandchild = folder('Morning', child.id as number);
    const sibling = folder('Midweek');

    const ids = (media.getMediaFolderDescendants(db, root.id) as Row[]).map((r) => r.id);
    expect([...ids].sort()).toEqual([child.id, grandchild.id].sort());
    expect(ids).not.toContain(root.id);
    expect(ids).not.toContain(sibling.id);
  });

  it('deleteMediaFolder recurses: a 3-deep chain and all its media go, a sibling subtree survives', () => {
    const root = folder('Backgrounds');
    const child = folder('Sunday', root.id as number);
    const grandchild = folder('Morning', child.id as number);
    item({ name: 'root-bg', folder_id: root.id });
    item({ name: 'child-bg', folder_id: child.id });
    item({ name: 'grandchild-bg', folder_id: grandchild.id });

    const sibling = folder('Midweek');
    item({ name: 'sibling-bg', folder_id: sibling.id });
    item({ name: 'loose' });

    media.deleteMediaFolder(db, root.id);

    // Every folder in the deleted subtree is gone; the sibling remains.
    expect(folderIds()).toEqual([sibling.id]);
    // Media in the whole deleted subtree is gone; the sibling's and loose media stay.
    expect((media.getMedia(db) as Row[]).map((m) => m.name).sort()).toEqual(
      ['loose', 'sibling-bg'].sort()
    );
  });

  it('deleteMediaFolder terminates and clears a corrupt parent_id cycle (UNION dedup guard)', () => {
    const a = folder('A');
    const b = folder('B', a.id as number);
    // Persist an illegal cycle straight through the column: A's parent is B.
    db.prepare('UPDATE media_folders SET parent_id = ? WHERE id = ?').run(b.id, a.id);
    item({ name: 'a-bg', folder_id: a.id });
    item({ name: 'b-bg', folder_id: b.id });

    // Must not hang; must remove both folders and their media.
    media.deleteMediaFolder(db, a.id);
    expect(folderIds()).toEqual([]);
    expect(media.getMedia(db)).toEqual([]);
  });
});
