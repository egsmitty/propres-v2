import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan A3 + A3b / phase7 #14. The seeder must only ever touch rows it created
// (identified by built_in_key), must never delete anything, and — A3b — must
// refresh a hymn only when the user never edited it. "Edited" is decided by
// comparing the row's TEXT fingerprint with the revision the seeder stamped.

vi.mock('@/utils/ipc', () => ({
  getSongs: vi.fn(),
  createSong: vi.fn(),
  updateSong: vi.fn(),
  deleteSong: vi.fn(),
}));
vi.mock('@/utils/builtInHymns', () => ({
  getBuiltInHymns: vi.fn(),
  buildSongRecordFromBuiltInHymn: vi.fn(),
}));

import { ensureBuiltInSongsSeeded } from '@/utils/builtInSongSeed';
import { createSong, deleteSong, getSongs, updateSong } from '@/utils/ipc';
import { buildSongRecordFromBuiltInHymn, getBuiltInHymns } from '@/utils/builtInHymns';
import { hymnTextFingerprint } from '@/utils/builtInHymnFingerprint';

const HYMNS = [
  { id: 'amazing-grace', title: 'Amazing Grace' },
  { id: 'how-great-thou-art', title: 'How Great Thou Art' },
];

/** The text the seeder would write for a hymn. Ids are random on purpose, as in production. */
const SOURCE_TEXT: Record<string, string[]> = {
  'amazing-grace': ['Amazing grace how sweet the sound', 'Twas grace that taught'],
  'how-great-thou-art': ['O Lord my God', 'Then sings my soul'],
};

function groupsJson(bodies: string[]) {
  return JSON.stringify(
    bodies.map((body, i) => ({
      id: `g-${Math.random()}`,
      type: 'verse',
      label: `Verse ${i + 1}`,
      slides: [{ id: `s-${Math.random()}`, body }],
    }))
  );
}

const payloadFor = (hymn: { id: string; title: string }) => ({
  title: hymn.title,
  artist: '',
  builtInKey: hymn.id,
  tags: '["hymn","public-domain","built-in"]',
  songGroups: groupsJson(SOURCE_TEXT[hymn.id]!),
  slides: '[]',
});

/** A keyed row as the database would return it. */
function keyedRow(hymnId: string, over: Record<string, unknown> = {}) {
  const hymn = HYMNS.find((h) => h.id === hymnId)!;
  return {
    id: 7,
    title: hymn.title,
    artist: '',
    builtInKey: hymnId,
    builtInRevision: null as string | null,
    ccli: '22025',
    songGroups: groupsJson(SOURCE_TEXT[hymnId]!),
    ...over,
  };
}

function library(...songs: Array<Record<string, unknown>>) {
  vi.mocked(getSongs).mockResolvedValue({ success: true, data: songs });
}

const createdKeys = () =>
  vi.mocked(createSong).mock.calls.map((c) => (c[0] as { builtInKey: string }).builtInKey);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBuiltInHymns).mockReturnValue(HYMNS as never);
  vi.mocked(buildSongRecordFromBuiltInHymn).mockImplementation(
    (hymn: { id: string; title: string }) => payloadFor(hymn) as never
  );
  vi.mocked(createSong).mockImplementation(async (data: { builtInKey: string }) => ({
    success: true,
    data: { id: 100, ...data },
  }));
  vi.mocked(updateSong).mockResolvedValue({ success: true, data: {} });
  vi.mocked(deleteSong).mockResolvedValue({ success: true, data: {} });
});

describe('ensureBuiltInSongsSeeded — creation and never-delete', () => {
  it('creates every hymn, keyed and stamped with its text fingerprint', async () => {
    library();
    await ensureBuiltInSongsSeeded();

    expect(createdKeys()).toEqual(['amazing-grace', 'how-great-thou-art']);
    for (const [payload] of vi.mocked(createSong).mock.calls) {
      const p = payload as { builtInRevision: string; title: string; songGroups: string };
      expect(p.builtInRevision).toBe(hymnTextFingerprint(p));
    }
    expect(updateSong).not.toHaveBeenCalled();
    expect(deleteSong).not.toHaveBeenCalled();
  });

  it("leaves a user's own same-titled song tagged hymn untouched and creates the keyed hymn", async () => {
    library({ id: 3, title: 'Amazing Grace', builtInKey: null, tags: '["hymn"]', ccli: '' });
    await ensureBuiltInSongsSeeded();
    expect(updateSong).not.toHaveBeenCalled();
    expect(deleteSong).not.toHaveBeenCalled();
    expect(createdKeys()).toEqual(['amazing-grace', 'how-great-thou-art']);
  });

  it('leaves an unkeyed built-in-tagged row alone — migration 3 owns that case', async () => {
    library({
      id: 3,
      title: 'Amazing Grace',
      builtInKey: null,
      tags: '["hymn","public-domain","built-in"]',
    });
    await ensureBuiltInSongsSeeded();
    expect(updateSong).not.toHaveBeenCalled();
    expect(deleteSong).not.toHaveBeenCalled();
    expect(createSong).toHaveBeenCalledTimes(2);
  });

  it('shares a single run between concurrent callers', async () => {
    library();
    await Promise.all([ensureBuiltInSongsSeeded(), ensureBuiltInSongsSeeded()]);
    expect(getSongs).toHaveBeenCalledTimes(1);
  });
});

describe('ensureBuiltInSongsSeeded — refresh only if untouched (the 5 keyed rows of the matrix)', () => {
  // Behaviour-change edit (A3b): A3 pinned "keyed row → always refreshed".
  // That is now only true for an UNTOUCHED row whose source text changed.

  it('revision NULL and row text equals the source: refresh once and stamp (adoption)', async () => {
    const row = keyedRow('amazing-grace');
    library(row);
    await ensureBuiltInSongsSeeded();

    expect(updateSong).toHaveBeenCalledTimes(1);
    const [id, data] = vi.mocked(updateSong).mock.calls[0]!;
    expect(id).toBe(7);
    const d = data as { builtInRevision: string; ccli: string; builtInKey: string };
    expect(d.builtInKey).toBe('amazing-grace');
    expect(d.ccli).toBe('22025');
    expect(d.builtInRevision).toBe(hymnTextFingerprint(payloadFor(HYMNS[0]!)));
    expect(createdKeys()).toEqual(['how-great-thou-art']);
  });

  it('revision NULL and row text differs from the source: leave it alone (edited or legacy variant)', async () => {
    library(keyedRow('amazing-grace', { songGroups: groupsJson(['A different arrangement']) }));
    await ensureBuiltInSongsSeeded();
    expect(vi.mocked(updateSong).mock.calls.filter((c) => c[0] === 7)).toEqual([]);
    expect(deleteSong).not.toHaveBeenCalled();
  });

  it('row text no longer matches its stamped revision (user edited): leave it alone, forever', async () => {
    const original = keyedRow('amazing-grace');
    const stamped = hymnTextFingerprint(original); // what the seeder wrote
    library(
      keyedRow('amazing-grace', {
        builtInRevision: stamped,
        songGroups: groupsJson(['Amazing grace how sweet the sound', 'Twas grace — MY EDIT']),
      })
    );
    await ensureBuiltInSongsSeeded();
    expect(vi.mocked(updateSong).mock.calls.filter((c) => c[0] === 7)).toEqual([]);
  });

  it('row matches its revision (untouched) and the source text changed: refresh and restamp', async () => {
    const oldText = keyedRow('amazing-grace', {
      songGroups: groupsJson(['OLD first line', 'OLD second']),
    });
    library(
      keyedRow('amazing-grace', { ...oldText, builtInRevision: hymnTextFingerprint(oldText) })
    );
    await ensureBuiltInSongsSeeded();

    const call = vi.mocked(updateSong).mock.calls.find((c) => c[0] === 7);
    expect(call).toBeDefined();
    expect((call![1] as { builtInRevision: string }).builtInRevision).toBe(
      hymnTextFingerprint(payloadFor(HYMNS[0]!))
    );
  });

  it('row matches its revision (untouched) and the source is unchanged: no write at all', async () => {
    const current = keyedRow('amazing-grace');
    library({ ...current, builtInRevision: hymnTextFingerprint(current) });
    await ensureBuiltInSongsSeeded();
    expect(vi.mocked(updateSong).mock.calls.filter((c) => c[0] === 7)).toEqual([]);
    expect(deleteSong).not.toHaveBeenCalled();
  });
});
