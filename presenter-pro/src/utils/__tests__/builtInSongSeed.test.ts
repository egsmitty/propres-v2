import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan A3 / phase7 #14. The seeder must only ever touch rows it created —
// identified by built_in_key — and must never delete anything. Title or tag
// coincidence with a user's own song is not a match.

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

const HYMNS = [
  { id: 'amazing-grace', title: 'Amazing Grace' },
  { id: 'how-great-thou-art', title: 'How Great Thou Art' },
];

const payloadFor = (hymn: { id: string; title: string }) => ({
  title: hymn.title,
  builtInKey: hymn.id,
  tags: '["hymn","public-domain","built-in"]',
  slides: '[]',
});

function library(...songs: Array<Record<string, unknown>>) {
  vi.mocked(getSongs).mockResolvedValue({ success: true, data: songs });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBuiltInHymns).mockReturnValue(HYMNS as never);
  vi.mocked(buildSongRecordFromBuiltInHymn).mockImplementation(
    (hymn: { id: string; title: string }) => payloadFor(hymn) as never
  );
  vi.mocked(createSong).mockImplementation(async (data: { builtInKey: string }) => ({
    success: true,
    data: { id: Math.floor(Math.random() * 1000) + 100, ...data },
  }));
  vi.mocked(updateSong).mockResolvedValue({ success: true, data: {} });
  vi.mocked(deleteSong).mockResolvedValue({ success: true, data: {} });
});

describe('ensureBuiltInSongsSeeded', () => {
  it('creates every hymn, keyed, when the library is empty — and deletes nothing', async () => {
    library();
    await ensureBuiltInSongsSeeded();

    expect(
      vi.mocked(createSong).mock.calls.map((c) => (c[0] as { builtInKey: string }).builtInKey)
    ).toEqual(['amazing-grace', 'how-great-thou-art']);
    expect(updateSong).not.toHaveBeenCalled();
    expect(deleteSong).not.toHaveBeenCalled();
  });

  it('refreshes a row that carries the key, preserving its ccli', async () => {
    library({ id: 7, title: 'Amazing Grace', builtInKey: 'amazing-grace', ccli: '22025' });
    await ensureBuiltInSongsSeeded();

    expect(updateSong).toHaveBeenCalledTimes(1);
    expect(updateSong).toHaveBeenCalledWith(7, { ...payloadFor(HYMNS[0]!), ccli: '22025' });
    // Only the other hymn is created.
    expect(
      vi.mocked(createSong).mock.calls.map((c) => (c[0] as { builtInKey: string }).builtInKey)
    ).toEqual(['how-great-thou-art']);
    expect(deleteSong).not.toHaveBeenCalled();
  });

  it("leaves a user's own same-titled song tagged hymn untouched and creates the keyed hymn", async () => {
    // The data-loss case from phase7 #14: this row used to be overwritten.
    library({ id: 3, title: 'Amazing Grace', builtInKey: null, tags: '["hymn"]', ccli: '' });
    await ensureBuiltInSongsSeeded();

    expect(updateSong).not.toHaveBeenCalled();
    expect(deleteSong).not.toHaveBeenCalled();
    expect(
      vi.mocked(createSong).mock.calls.map((c) => (c[0] as { builtInKey: string }).builtInKey)
    ).toEqual(['amazing-grace', 'how-great-thou-art']);
  });

  it('leaves an unkeyed built-in-tagged row alone — migration 3 owns that case, not the seeder', async () => {
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

  it('never deletes even when two rows share a key — the first is refreshed, the rest untouched', async () => {
    library(
      { id: 1, title: 'Amazing Grace', builtInKey: 'amazing-grace', ccli: '' },
      { id: 2, title: 'Amazing Grace (copy)', builtInKey: 'amazing-grace', ccli: '' }
    );
    await ensureBuiltInSongsSeeded();

    expect(vi.mocked(updateSong).mock.calls.map((c) => c[0])).toEqual([1]);
    expect(deleteSong).not.toHaveBeenCalled();
  });

  it('shares a single run between concurrent callers', async () => {
    library();
    await Promise.all([ensureBuiltInSongsSeeded(), ensureBuiltInSongsSeeded()]);
    expect(getSongs).toHaveBeenCalledTimes(1);
  });
});
