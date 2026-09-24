import { getMediaAssetUrl } from '@/utils/backgrounds';
import type { MediaFolder } from '@/utils/mediaFolders';

/**
 * The seam between our serialized media rows and the Builder-shaped records the
 * ported `MediaLibraryBrowser` reads (plan #155-P3).
 *
 * The Builder's library speaks string ids, camelCase, and a `urls` set
 * (`MediaPicker.tsx` in Motion-Worship Builder). Our rows are sqlite: numeric
 * ids, snake_case, and `presenterpro-media://` URLs added by the main process's
 * `serializeMediaRecord`. Adapting at this one boundary keeps the browser a
 * near-verbatim port and the rest of the app unchanged.
 */

export type MediaKind = 'image' | 'video';

/** A media row as the main process serializes it (`db:media:getAll`). */
export interface MediaRow {
  id: number;
  name: string;
  type: string;
  file_path: string;
  thumbnail_path?: string | null;
  folder_id?: number | null;
  created_at?: number | null;
  file_exists?: boolean;
  file_url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  [key: string]: unknown;
}

/** A `media_folders` row (`db:mediaFolders:getAll`); `parent_id` since migration 6. */
export interface MediaFolderRow {
  id: number;
  name: string;
  parent_id?: number | null;
  created_at?: number | null;
}

/**
 * Our library record. It carries the fields the Builder's browser reads
 * (`mediaId`, `fileName`, `urls`, `altText`, `folderId`) plus what this app
 * needs: our media kind (the Builder's `mediaType` is a different enum), the
 * missing-file flag, and the raw row for actions that need the full record
 * (inserting a media slide, setting a background).
 */
export interface LibraryMedia {
  mediaId: string;
  fileName: string;
  mediaType: MediaKind;
  urls: { original: string; large: string; medium: string; small: string };
  altText?: string;
  /** `null` = the library root. */
  folderId: string | null;
  createdAt: string;
  fileExists: boolean;
  raw: MediaRow;
}

/**
 * The contract the browser consumes — the Builder's `MediaLibraryProp` with our
 * two differences: media is registered through the native picker
 * (`importMedia`), not uploaded, and media can be renamed.
 */
export interface MediaLibraryProp {
  photos: LibraryMedia[];
  folders: MediaFolder[];
  /** True only until the first fetch resolves; refetches never flip it back. */
  loading: boolean;
  totalCount: number;
  atCap: boolean;
  fetchPhotos: () => Promise<void>;
  deletePhoto: (mediaId: string) => Promise<void>;
  renamePhoto: (mediaId: string, name: string) => Promise<void>;
  movePhoto: (mediaId: string, folderId: string | null) => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  moveFolder: (folderId: string, parentId: string | null) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  importMedia: (folderId: string | null) => Promise<void>;
}

/**
 * A library id back to a row id. Only a plain run of digits counts:
 * `Number('')` and `Number(' ')` are 0, `Number('1e3')` is 1000, `Number('0x10')`
 * is 16 — all finite, all wrong for a row id.
 */
export function toDbId(id: string | null | undefined): number | null {
  if (typeof id !== 'string' || !/^\d+$/.test(id)) return null;
  return Number(id);
}

function isoFromSeconds(seconds: number | null | undefined): string {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : '';
}

export function toLibraryPhoto(row: MediaRow): LibraryMedia {
  const large = getMediaAssetUrl(row);
  return {
    mediaId: String(row.id),
    fileName: row.name,
    mediaType: row.type === 'video' ? 'video' : 'image',
    urls: {
      original: large,
      large,
      medium: row.preview_url || large,
      small: getMediaAssetUrl(row, { preferThumbnail: true }),
    },
    folderId: row.folder_id == null ? null : String(row.folder_id),
    createdAt: isoFromSeconds(row.created_at),
    fileExists: row.file_exists !== false,
    raw: row,
  };
}

export function toLibraryFolder(row: MediaFolderRow): MediaFolder {
  return {
    folderId: String(row.id),
    name: row.name,
    parentId: row.parent_id == null ? null : String(row.parent_id),
    createdAt: isoFromSeconds(row.created_at),
  };
}
