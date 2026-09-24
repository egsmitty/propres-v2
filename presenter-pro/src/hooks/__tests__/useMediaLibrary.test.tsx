// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/utils/ipc', () => ({
  getMedia: vi.fn(),
  getMediaFolders: vi.fn(),
  createMediaFolder: vi.fn(),
  updateMediaFolder: vi.fn(),
  deleteMediaFolder: vi.fn(),
  updateMedia: vi.fn(),
  deleteMedia: vi.fn(),
  importMedia: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));

import {
  createMediaFolder,
  deleteMedia,
  deleteMediaFolder,
  getMedia,
  getMediaFolders,
  importMedia,
  updateMedia,
  updateMediaFolder,
} from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { LIBRARY_ITEM_CAP, MAX_FOLDER_PATH_DEPTH } from '@/utils/mediaFolders';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';

// Plan #155-P3. The hook is the Builder's `MediaLibraryProp` over our IPC. It
// adapts rows, keeps `loading` for the first fetch only, guards folder moves the
// same way the browser does (so a later caller cannot bypass the depth rule),
// and turns every failed envelope into a refetch plus a visible alert.

const media = (id: number, name: string, folder_id: number | null = null, type = 'image') => ({
  id,
  name,
  type,
  file_path: `/m/${name}`,
  folder_id,
  created_at: 1_700_000_000 + id,
  file_exists: true,
  file_url: `presenterpro-media://asset?path=%2Fm%2F${name}`,
  thumbnail_url: null,
  preview_url: null,
});
const folder = (id: number, name: string, parent_id: number | null = null) => ({
  id,
  name,
  parent_id,
  created_at: 1_700_000_000 + id,
});

// ALL > Backgrounds(1) > Sunday(2) · ALL > Midweek(3) > Evening(4). Sunday and
// Evening sit at depth 3, the max — anything created under them is one too deep.
const FOLDERS = [
  folder(1, 'Backgrounds'),
  folder(2, 'Sunday', 1),
  folder(3, 'Midweek'),
  folder(4, 'Evening', 3),
];
const MEDIA = [media(10, 'a.png'), media(11, 'b.png', 1), media(12, 'c.mp4', 2, 'video')];

const ok = <T,>(data: T) => ({ success: true as const, data });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMedia).mockResolvedValue(ok(MEDIA));
  vi.mocked(getMediaFolders).mockResolvedValue(ok(FOLDERS));
  vi.mocked(createMediaFolder).mockResolvedValue(ok(folder(9, 'New')));
  vi.mocked(updateMediaFolder).mockResolvedValue(ok(folder(2, 'Sunday')));
  vi.mocked(deleteMediaFolder).mockResolvedValue({ success: true });
  vi.mocked(updateMedia).mockResolvedValue(ok(MEDIA[1]));
  vi.mocked(deleteMedia).mockResolvedValue({ success: true });
  vi.mocked(importMedia).mockResolvedValue(ok([]));
});

async function renderLoaded() {
  const hook = renderHook(() => useMediaLibrary());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useMediaLibrary — fetch and shape', () => {
  it('loads both lists on mount and adapts them to string ids', async () => {
    const { result } = await renderLoaded();
    expect(result.current.photos.map((p) => p.mediaId)).toEqual(['10', '11', '12']);
    expect(result.current.photos[2]?.mediaType).toBe('video');
    expect(result.current.folders.map((f) => [f.folderId, f.parentId])).toEqual([
      ['1', null],
      ['2', '1'],
      ['3', null],
      ['4', '3'],
    ]);
  });

  it('is loading only until the first fetch resolves — a refetch never flips it back', async () => {
    const hook = renderHook(() => useMediaLibrary());
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(() => hook.result.current.fetchPhotos());
    expect(hook.result.current.loading).toBe(false);
    expect(getMedia).toHaveBeenCalledTimes(2);
  });

  it('derives totalCount and atCap from the production cap', async () => {
    const { result } = await renderLoaded();
    expect(result.current.totalCount).toBe(MEDIA.length + FOLDERS.length);
    expect(result.current.atCap).toBe(false);

    const many = Array.from({ length: LIBRARY_ITEM_CAP - FOLDERS.length }, (_, i) =>
      media(100 + i, `m${i}.png`)
    );
    vi.mocked(getMedia).mockResolvedValue(ok(many));
    await act(() => result.current.fetchPhotos());
    expect(result.current.totalCount).toBe(LIBRARY_ITEM_CAP);
    expect(result.current.atCap).toBe(true);
  });
});

describe('useMediaLibrary — folders', () => {
  it('createFolder sends a numeric parentId, or null at root', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.createFolder('Evening', '1'));
    expect(createMediaFolder).toHaveBeenLastCalledWith({ name: 'Evening', parentId: 1 });
    await act(() => result.current.createFolder('Loose', null));
    expect(createMediaFolder).toHaveBeenLastCalledWith({ name: 'Loose', parentId: null });
  });

  it('createFolder refuses a folder past the max depth: alert, no call', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.createFolder('Too deep', '2'));
    expect(createMediaFolder).not.toHaveBeenCalled();
    expect(alertDialog).toHaveBeenCalledWith(
      expect.stringContaining(String(MAX_FOLDER_PATH_DEPTH)),
      expect.anything()
    );
  });

  it('renameFolder sends the new name only', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.renameFolder('2', 'Sunday AM'));
    expect(updateMediaFolder).toHaveBeenCalledWith(2, { name: 'Sunday AM' });
  });

  it('moveFolder sends parent_id numeric, or null to root', async () => {
    const { result } = await renderLoaded();
    // Sunday (a leaf) under Midweek: depth 3 = max, allowed.
    await act(() => result.current.moveFolder('2', '3'));
    expect(updateMediaFolder).toHaveBeenLastCalledWith(2, { parent_id: 3 });
    await act(() => result.current.moveFolder('2', null));
    expect(updateMediaFolder).toHaveBeenLastCalledWith(2, { parent_id: null });
  });

  it('moveFolder refuses itself, its own subtree, and an over-depth move: alert, no call', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.moveFolder('1', '1')); // itself
    await act(() => result.current.moveFolder('1', '2')); // its own subfolder
    // Midweek (height 2) under Sunday (depth 3) would be 5 levels.
    await act(() => result.current.moveFolder('3', '2'));
    expect(updateMediaFolder).not.toHaveBeenCalled();
    expect(alertDialog).toHaveBeenCalledTimes(3);
  });

  it('deleteFolder deletes then refetches — the cascade on disk is the truth', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.deleteFolder('2'));
    expect(deleteMediaFolder).toHaveBeenCalledWith(2);
    expect(getMedia).toHaveBeenCalledTimes(2);
    expect(getMediaFolders).toHaveBeenCalledTimes(2);
  });
});

describe('useMediaLibrary — media', () => {
  it('movePhoto sends folder_id numeric, or null to root', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.movePhoto('10', '2'));
    expect(updateMedia).toHaveBeenLastCalledWith(10, { folder_id: 2 });
    await act(() => result.current.movePhoto('11', null));
    expect(updateMedia).toHaveBeenLastCalledWith(11, { folder_id: null });
  });

  it('renamePhoto sends the new name and the raw row follows, so an inserted media slide gets the new label', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.renamePhoto('10', 'dawn.png'));
    expect(updateMedia).toHaveBeenCalledWith(10, { name: 'dawn.png' });
    const renamed = result.current.photos.find((p) => p.mediaId === '10');
    expect(renamed?.fileName).toBe('dawn.png');
    expect(renamed?.raw.name).toBe('dawn.png');
  });

  it('movePhoto keeps the raw row in step with the new folder', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.movePhoto('10', '2'));
    expect(result.current.photos.find((p) => p.mediaId === '10')?.raw.folder_id).toBe(2);
    await act(() => result.current.movePhoto('10', null));
    expect(result.current.photos.find((p) => p.mediaId === '10')?.raw.folder_id).toBeNull();
  });

  it('deletePhoto deletes and drops the item locally without a refetch', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.deletePhoto('11'));
    expect(deleteMedia).toHaveBeenCalledWith(11);
    expect(result.current.photos.map((p) => p.mediaId)).toEqual(['10', '12']);
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  it('importMedia opens the picker for the folder and refetches only when files came back', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.importMedia('2'));
    expect(importMedia).toHaveBeenCalledWith({ folderId: 2 });
    expect(getMedia).toHaveBeenCalledTimes(1); // cancelled picker: nothing to reload

    vi.mocked(importMedia).mockResolvedValue(ok([media(50, 'new.png', 2)]));
    await act(() => result.current.importMedia(null));
    expect(importMedia).toHaveBeenLastCalledWith({ folderId: null });
    expect(getMedia).toHaveBeenCalledTimes(2);
  });
});

describe('useMediaLibrary — failures are visible', () => {
  it('a failed envelope alerts with its error and refetches', async () => {
    const { result } = await renderLoaded();
    vi.mocked(updateMediaFolder).mockResolvedValue({
      success: false,
      error: 'The destination folder does not exist.',
    });
    await act(() => result.current.moveFolder('2', '3'));
    expect(alertDialog).toHaveBeenCalledWith(
      'The destination folder does not exist.',
      expect.anything()
    );
    expect(getMedia).toHaveBeenCalledTimes(2);
  });
});
