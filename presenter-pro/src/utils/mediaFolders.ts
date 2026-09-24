/**
 * Pure folder / cap / search logic for the media library (plan #155-P2).
 *
 * Ported from Motion-Worship Builder, `packages/templates/src/editors/
 * mediaFolders.ts` (its #327 media-library rework), reformatted to this repo.
 * Two constants differ on purpose — see `LIBRARY_ITEM_CAP` and
 * `FOLDER_NAME_MAX_LENGTH`; every function's behavior is the Builder's.
 *
 * The folder shape is a flat list with parent pointers; "root" (the ALL level)
 * is `parentId: null` and is not itself a record. Ids are strings here, as in
 * the Builder: the library hook adapts our INTEGER rows with `String(id)` so
 * the ported browser stays a near-verbatim port.
 */

export interface MediaFolder {
  folderId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

/** Minimal photo shape the folder logic needs (our adapted media rows satisfy it). */
export interface FolderedPhotoLike {
  mediaId: string;
  fileName: string;
  altText?: string;
  /** Absent/null = lives at root. */
  folderId?: string | null;
}

/**
 * Photos + folders both count toward the library cap. The Builder ships 500
 * (a cloud quota); this is a local-first app, so Ethan asked for a generous
 * cap instead (charter decision D.3). One line to tune.
 */
export const LIBRARY_ITEM_CAP = 1000;

/** Max breadcrumb depth: ALL (root) > folder > subfolder (charter decision D.4). */
export const MAX_FOLDER_PATH_DEPTH = 3;

/**
 * Folder name limit. The Builder's 20 is its shared editor-field affordance,
 * which this app does not have, and our existing folders carry no limit — 20
 * would reject ordinary names like "Christmas Backgrounds 2026". Applies to new
 * and renamed names; longer existing names still display.
 */
export const FOLDER_NAME_MAX_LENGTH = 40;

export function countLibraryItems(photos: readonly unknown[], folders: readonly unknown[]): number {
  return photos.length + folders.length;
}

export function isAtLibraryCap(photos: readonly unknown[], folders: readonly unknown[]): boolean {
  return countLibraryItems(photos, folders) >= LIBRARY_ITEM_CAP;
}

function byId(folders: readonly MediaFolder[]): Map<string, MediaFolder> {
  return new Map(folders.map((f) => [f.folderId, f]));
}

/**
 * Breadcrumb depth of a location: root = 1, a top-level folder = 2, a
 * subfolder = 3. A corrupt parent cycle returns a value past the max so every
 * guard fails closed instead of recursing forever.
 */
export function folderLocationDepth(
  folders: readonly MediaFolder[],
  folderId: string | null
): number {
  const map = byId(folders);
  const seen = new Set<string>();
  let depth = 1;
  let cursor = folderId;
  while (cursor) {
    if (seen.has(cursor)) return MAX_FOLDER_PATH_DEPTH + 1;
    seen.add(cursor);
    depth += 1;
    cursor = map.get(cursor)?.parentId ?? null;
  }
  return depth;
}

/** Height of a folder's subtree: 1 for a leaf, 2 when it has subfolders, etc. */
export function subtreeHeight(folders: readonly MediaFolder[], folderId: string): number {
  const children = folders.filter((f) => f.parentId === folderId);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((c) => subtreeHeight(folders, c.folderId)));
}

/** True when `maybeDescendantId` is `ancestorId` itself or sits anywhere under it. */
export function isDescendantOrSelf(
  folders: readonly MediaFolder[],
  ancestorId: string,
  maybeDescendantId: string
): boolean {
  const map = byId(folders);
  const seen = new Set<string>();
  let cursor: string | null = maybeDescendantId;
  while (cursor) {
    if (cursor === ancestorId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = map.get(cursor)?.parentId ?? null;
  }
  return false;
}

/** A new folder may be created only where its own depth stays within the max. */
export function canCreateFolderIn(
  folders: readonly MediaFolder[],
  parentId: string | null
): boolean {
  return folderLocationDepth(folders, parentId) + 1 <= MAX_FOLDER_PATH_DEPTH;
}

/**
 * A folder move is allowed unless it targets itself / its own subtree or the
 * moved subtree would end up nested past the max depth.
 */
export function canMoveFolder(
  folders: readonly MediaFolder[],
  folderId: string,
  targetParentId: string | null
): boolean {
  if (targetParentId !== null && isDescendantOrSelf(folders, folderId, targetParentId)) {
    return false;
  }
  return (
    folderLocationDepth(folders, targetParentId) + subtreeHeight(folders, folderId) <=
    MAX_FOLDER_PATH_DEPTH
  );
}

/**
 * Everything a cascade delete removes: the folder itself, every descendant
 * folder, and every photo assigned to any of them.
 */
export function collectCascadeDescendants(
  folders: readonly MediaFolder[],
  photos: readonly FolderedPhotoLike[],
  folderId: string
): { folderIds: string[]; photoIds: string[] } {
  const folderIds: string[] = [];
  const queue = [folderId];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    folderIds.push(current);
    for (const child of folders.filter((f) => f.parentId === current)) {
      queue.push(child.folderId);
    }
  }
  const photoIds = photos
    .filter((p) => p.folderId != null && seen.has(p.folderId))
    .map((p) => p.mediaId);
  return { folderIds, photoIds };
}

/** Root-to-folder chain, excluding the root itself. Empty for root. */
export function buildFolderPath(
  folders: readonly MediaFolder[],
  folderId: string | null
): MediaFolder[] {
  const map = byId(folders);
  const path: MediaFolder[] = [];
  const seen = new Set<string>();
  let cursor = folderId;
  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const node = map.get(cursor);
    if (!node) break;
    path.unshift(node);
    cursor = node.parentId;
  }
  return path;
}

/** Direct children of a location, name-sorted (case-insensitive) for stable display. */
export function childFoldersOf(
  folders: readonly MediaFolder[],
  parentId: string | null
): MediaFolder[] {
  return folders
    .filter((f) => (f.parentId ?? null) === parentId)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Photos living at a location (missing folderId = root). */
export function photosIn<T extends FolderedPhotoLike>(
  photos: readonly T[],
  folderId: string | null
): T[] {
  return photos.filter((p) => (p.folderId ?? null) === folderId);
}

export interface FolderDropdownRow {
  folder: MediaFolder;
  /** Folder names from the top level down to this folder, inclusive. */
  path: string[];
}

/**
 * Every folder, root children first then depth-first, each with its full name
 * path — the row list for the Explorer-address-bar style dropdown.
 */
export function listFoldersDepthFirst(folders: readonly MediaFolder[]): FolderDropdownRow[] {
  const rows: FolderDropdownRow[] = [];
  const walk = (parentId: string | null, prefix: string[]) => {
    for (const child of childFoldersOf(folders, parentId)) {
      const path = [...prefix, child.name];
      rows.push({ folder: child, path });
      walk(child.folderId, path);
    }
  };
  walk(null, []);
  return rows;
}

/**
 * Recursive library search: matches file name and alt text case-insensitively
 * across every folder. Blank queries match nothing.
 */
export function searchLibraryPhotos<T extends FolderedPhotoLike>(
  photos: readonly T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return photos.filter(
    (p) => p.fileName.toLowerCase().includes(q) || (p.altText ?? '').toLowerCase().includes(q)
  );
}

export function folderNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= FOLDER_NAME_MAX_LENGTH;
}
