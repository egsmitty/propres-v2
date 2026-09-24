import { describe, it, expect } from 'vitest';
import {
  FOLDER_NAME_MAX_LENGTH,
  LIBRARY_ITEM_CAP,
  MAX_FOLDER_PATH_DEPTH,
  buildFolderPath,
  canCreateFolderIn,
  canMoveFolder,
  childFoldersOf,
  collectCascadeDescendants,
  countLibraryItems,
  folderLocationDepth,
  folderNameValid,
  isAtLibraryCap,
  isDescendantOrSelf,
  listFoldersDepthFirst,
  photosIn,
  searchLibraryPhotos,
  subtreeHeight,
  type FolderedPhotoLike,
  type MediaFolder,
} from '@/utils/mediaFolders';

// Plan #155-P2: the Builder's pure folder logic, ported. The Builder ships no
// tests for it, so these pin every documented contract. Expectations derive
// from the exported constants, never from parallel literals; the three
// product constants themselves are pinned once, against the charter's
// decisions, so a silent change fails here.

const folder = (folderId: string, name: string, parentId: string | null): MediaFolder => ({
  folderId,
  name,
  parentId,
  createdAt: '2026-09-24T00:00:00.000Z',
});

// ALL > Backgrounds > Sunday · ALL > Zeta · ALL > alpha — deliberately unsorted.
const BACKGROUNDS = folder('A', 'Backgrounds', null);
const SUNDAY = folder('B', 'Sunday', 'A');
const ZETA = folder('C', 'Zeta', null);
const ALPHA = folder('L', 'alpha', null);
const FOLDERS: MediaFolder[] = [ZETA, BACKGROUNDS, SUNDAY, ALPHA];

const photo = (
  mediaId: string,
  fileName: string,
  folderId?: string | null,
  altText?: string
): FolderedPhotoLike => ({ mediaId, fileName, folderId, altText });

const PHOTOS: FolderedPhotoLike[] = [
  photo('p1', 'Cross.jpg'), // root: folderId absent
  photo('p2', 'sunrise.png', 'A', 'Warm dawn'),
  photo('p3', 'candles.png', 'B'),
  photo('p4', 'ZEBRA.jpg', 'C'),
  photo('p5', 'loose.webp', null), // root: folderId explicitly null
];

describe('product constants (charter decisions D.3 / D.4 / P2 decision 2)', () => {
  it('keeps a generous cap of 1000, 3 breadcrumb levels, and a 40-character folder name', () => {
    expect(LIBRARY_ITEM_CAP).toBe(1000);
    expect(MAX_FOLDER_PATH_DEPTH).toBe(3);
    expect(FOLDER_NAME_MAX_LENGTH).toBe(40);
  });
});

describe('library cap', () => {
  it('counts photos and folders together', () => {
    expect(countLibraryItems(PHOTOS, FOLDERS)).toBe(PHOTOS.length + FOLDERS.length);
  });

  it('trips exactly at the cap, counting folders toward it', () => {
    expect(isAtLibraryCap(PHOTOS, FOLDERS)).toBe(false);
    const oneShort = new Array(LIBRARY_ITEM_CAP - FOLDERS.length - 1).fill(null);
    expect(isAtLibraryCap(oneShort, FOLDERS)).toBe(false);
    const exactlyAtCap = new Array(LIBRARY_ITEM_CAP - FOLDERS.length).fill(null);
    expect(isAtLibraryCap(exactlyAtCap, FOLDERS)).toBe(true);
  });
});

describe('folderLocationDepth', () => {
  it('is 1 at root, 2 for a top-level folder, 3 for a subfolder', () => {
    expect(folderLocationDepth(FOLDERS, null)).toBe(1);
    expect(folderLocationDepth(FOLDERS, 'A')).toBe(2);
    expect(folderLocationDepth(FOLDERS, 'B')).toBe(3);
  });

  it('fails closed on a corrupt parent cycle: one past the max, never an infinite loop', () => {
    const cycle = [folder('X', 'x', 'Y'), folder('Y', 'y', 'X')];
    expect(folderLocationDepth(cycle, 'X')).toBe(MAX_FOLDER_PATH_DEPTH + 1);
  });
});

describe('subtreeHeight', () => {
  it('is 1 for a leaf and grows by one per level of subfolders', () => {
    expect(subtreeHeight(FOLDERS, 'B')).toBe(1);
    expect(subtreeHeight(FOLDERS, 'C')).toBe(1);
    expect(subtreeHeight(FOLDERS, 'A')).toBe(2);
  });
});

describe('isDescendantOrSelf', () => {
  it('is true for the folder itself and anything under it, false for siblings and ancestors', () => {
    expect(isDescendantOrSelf(FOLDERS, 'A', 'A')).toBe(true);
    expect(isDescendantOrSelf(FOLDERS, 'A', 'B')).toBe(true);
    expect(isDescendantOrSelf(FOLDERS, 'A', 'C')).toBe(false);
    expect(isDescendantOrSelf(FOLDERS, 'B', 'A')).toBe(false);
  });

  it('terminates on a cycle that never reaches the ancestor', () => {
    const cycle = [folder('X', 'x', 'Y'), folder('Y', 'y', 'X'), folder('Z', 'z', null)];
    expect(isDescendantOrSelf(cycle, 'Z', 'X')).toBe(false);
  });
});

describe('canCreateFolderIn', () => {
  it('allows a folder wherever its own depth stays within the max, and refuses at the max', () => {
    expect(canCreateFolderIn(FOLDERS, null)).toBe(true); // would be depth 2
    expect(canCreateFolderIn(FOLDERS, 'A')).toBe(true); // depth 3 = max
    expect(canCreateFolderIn(FOLDERS, 'B')).toBe(false); // depth 4
  });
});

describe('canMoveFolder', () => {
  it('refuses a move into itself or into its own subtree', () => {
    expect(canMoveFolder(FOLDERS, 'A', 'A')).toBe(false);
    expect(canMoveFolder(FOLDERS, 'A', 'B')).toBe(false);
  });

  it('refuses a move whose subtree would end past the max depth, allows one that fits', () => {
    // Backgrounds (height 2) under Zeta (depth 2) → 4 > 3.
    expect(canMoveFolder(FOLDERS, 'A', 'C')).toBe(false);
    // Sunday (height 1) under Zeta (depth 2) → 3 = max.
    expect(canMoveFolder(FOLDERS, 'B', 'C')).toBe(true);
  });

  it('always allows a legal move to root', () => {
    expect(canMoveFolder(FOLDERS, 'A', null)).toBe(true);
    expect(canMoveFolder(FOLDERS, 'B', null)).toBe(true);
  });
});

describe('collectCascadeDescendants', () => {
  it('returns the folder, every descendant, and every photo in any of them — never a sibling’s', () => {
    expect(collectCascadeDescendants(FOLDERS, PHOTOS, 'A')).toEqual({
      folderIds: ['A', 'B'],
      photoIds: ['p2', 'p3'],
    });
  });

  it('returns just the folder and its own photos for a leaf; root photos are never collected', () => {
    expect(collectCascadeDescendants(FOLDERS, PHOTOS, 'C')).toEqual({
      folderIds: ['C'],
      photoIds: ['p4'],
    });
  });
});

describe('buildFolderPath', () => {
  it('is the root-to-folder chain, excluding root; empty for root', () => {
    expect(buildFolderPath(FOLDERS, 'B')).toEqual([BACKGROUNDS, SUNDAY]);
    expect(buildFolderPath(FOLDERS, 'A')).toEqual([BACKGROUNDS]);
    expect(buildFolderPath(FOLDERS, null)).toEqual([]);
  });

  it('stops at a broken parent pointer instead of throwing', () => {
    const orphan = folder('Q', 'Orphan', 'missing');
    expect(buildFolderPath([...FOLDERS, orphan], 'Q')).toEqual([orphan]);
  });
});

describe('childFoldersOf', () => {
  it('lists direct children in case-insensitive name order', () => {
    expect(childFoldersOf(FOLDERS, null)).toEqual([ALPHA, BACKGROUNDS, ZETA]);
    expect(childFoldersOf(FOLDERS, 'A')).toEqual([SUNDAY]);
    expect(childFoldersOf(FOLDERS, 'B')).toEqual([]);
  });
});

describe('photosIn', () => {
  it('treats a missing or null folderId as root', () => {
    expect(photosIn(PHOTOS, null)).toEqual([PHOTOS[0], PHOTOS[4]]);
    expect(photosIn(PHOTOS, 'A')).toEqual([PHOTOS[1]]);
    expect(photosIn(PHOTOS, 'B')).toEqual([PHOTOS[2]]);
  });
});

describe('listFoldersDepthFirst', () => {
  it('walks root children in name order, each subtree depth-first, with full name paths', () => {
    expect(listFoldersDepthFirst(FOLDERS)).toEqual([
      { folder: ALPHA, path: ['alpha'] },
      { folder: BACKGROUNDS, path: ['Backgrounds'] },
      { folder: SUNDAY, path: ['Backgrounds', 'Sunday'] },
      { folder: ZETA, path: ['Zeta'] },
    ]);
  });
});

describe('searchLibraryPhotos', () => {
  it('matches file names case-insensitively across every folder', () => {
    expect(searchLibraryPhotos(PHOTOS, 'CROSS')).toEqual([PHOTOS[0]]);
    expect(searchLibraryPhotos(PHOTOS, 'png')).toEqual([PHOTOS[1], PHOTOS[2]]);
    expect(searchLibraryPhotos(PHOTOS, 'zebra')).toEqual([PHOTOS[3]]);
  });

  it('matches alt text too', () => {
    expect(searchLibraryPhotos(PHOTOS, 'dawn')).toEqual([PHOTOS[1]]);
  });

  it('matches nothing for a blank or whitespace query, or a miss', () => {
    expect(searchLibraryPhotos(PHOTOS, '')).toEqual([]);
    expect(searchLibraryPhotos(PHOTOS, '   ')).toEqual([]);
    expect(searchLibraryPhotos(PHOTOS, 'no-such-file')).toEqual([]);
  });
});

describe('folderNameValid', () => {
  it('trims, then requires 1 to FOLDER_NAME_MAX_LENGTH characters', () => {
    expect(folderNameValid('')).toBe(false);
    expect(folderNameValid('   ')).toBe(false);
    expect(folderNameValid('a')).toBe(true);
    expect(folderNameValid('  padded  ')).toBe(true);
    expect(folderNameValid('x'.repeat(FOLDER_NAME_MAX_LENGTH))).toBe(true);
    expect(folderNameValid('x'.repeat(FOLDER_NAME_MAX_LENGTH + 1))).toBe(false);
  });
});
