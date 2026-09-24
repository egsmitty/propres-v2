import { describe, it, expect } from 'vitest';
import {
  toDbId,
  toLibraryFolder,
  toLibraryPhoto,
  type MediaFolderRow,
  type MediaRow,
} from '@/utils/mediaLibraryAdapter';
import { getMediaAssetUrl } from '@/utils/backgrounds';

// Plan #155-P3. The adapter is the seam between our serialized sqlite rows
// (numeric ids, snake_case, protocol URLs) and the Builder-shaped records the
// ported browser reads (string ids, camelCase, a `urls` set). Expectations for
// URLs come from the production resolver, never a parallel literal.

const ROW: MediaRow = {
  id: 42,
  name: 'sunrise.png',
  type: 'image',
  file_path: '/media/sunrise.png',
  thumbnail_path: '/media/.thumbs/sunrise.png',
  folder_id: 7,
  created_at: 1_700_000_000,
  file_exists: true,
  file_url: 'presenterpro-media://asset?path=%2Fmedia%2Fsunrise.png',
  thumbnail_url: 'presenterpro-media://asset?path=%2Fmedia%2F.thumbs%2Fsunrise.png',
  preview_url: null,
};

describe('toLibraryPhoto', () => {
  it('stringifies the id, maps the name and type, and keeps the raw row', () => {
    const photo = toLibraryPhoto(ROW);
    expect(photo.mediaId).toBe('42');
    expect(photo.fileName).toBe('sunrise.png');
    expect(photo.mediaType).toBe('image');
    expect(photo.raw).toBe(ROW);
  });

  it('builds the url set from the production resolver, thumbnail-first for small', () => {
    const photo = toLibraryPhoto(ROW);
    expect(photo.urls.small).toBe(getMediaAssetUrl(ROW, { preferThumbnail: true }));
    expect(photo.urls.large).toBe(getMediaAssetUrl(ROW));
    expect(photo.urls.original).toBe(getMediaAssetUrl(ROW));
    // No preview_url on this row, so medium falls back to large.
    expect(photo.urls.medium).toBe(getMediaAssetUrl(ROW));
    expect(toLibraryPhoto({ ...ROW, preview_url: 'p://preview' }).urls.medium).toBe('p://preview');
  });

  it('stringifies folder_id and preserves root as null', () => {
    expect(toLibraryPhoto(ROW).folderId).toBe('7');
    expect(toLibraryPhoto({ ...ROW, folder_id: null }).folderId).toBeNull();
    expect(toLibraryPhoto({ ...ROW, folder_id: undefined }).folderId).toBeNull();
  });

  it('turns created_at seconds into an ISO string, and an absent value into an empty string', () => {
    expect(toLibraryPhoto(ROW).createdAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(toLibraryPhoto({ ...ROW, created_at: null }).createdAt).toBe('');
  });

  it('marks a file missing only when the row says so', () => {
    expect(toLibraryPhoto(ROW).fileExists).toBe(true);
    expect(toLibraryPhoto({ ...ROW, file_exists: undefined }).fileExists).toBe(true);
    expect(toLibraryPhoto({ ...ROW, file_exists: false }).fileExists).toBe(false);
  });
});

describe('toLibraryFolder', () => {
  it('stringifies ids and preserves a root parent as null', () => {
    const root: MediaFolderRow = { id: 3, name: 'Backgrounds', parent_id: null, created_at: 1 };
    const child: MediaFolderRow = { id: 4, name: 'Sunday', parent_id: 3, created_at: 2 };
    expect(toLibraryFolder(root)).toEqual({
      folderId: '3',
      name: 'Backgrounds',
      parentId: null,
      createdAt: new Date(1000).toISOString(),
    });
    expect(toLibraryFolder(child).parentId).toBe('3');
    expect(toLibraryFolder({ id: 5, name: 'Legacy' }).parentId).toBeNull();
  });
});

describe('toDbId', () => {
  it('accepts only a plain run of digits', () => {
    expect(toDbId('42')).toBe(42);
    expect(toDbId('0')).toBe(0);
  });

  it('returns null for anything Number() would quietly coerce, and for null', () => {
    // Number('') and Number(' ') are 0, Number('1e3') is 1000, Number('0x10') is
    // 16 — all finite, all wrong for a row id.
    for (const bad of ['', ' ', '1e3', '0x10', 'abc', '4.5', '-1', null, undefined]) {
      expect(toDbId(bad), String(bad)).toBeNull();
    }
  });
});
