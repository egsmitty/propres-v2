import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMediaFolder,
  deleteMedia,
  deleteMediaFolder,
  getMedia,
  getMediaFolders,
  importMedia as importMediaIpc,
  updateMedia,
  updateMediaFolder,
} from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { useLatest } from '@/hooks/useLatest';
import {
  LIBRARY_ITEM_CAP,
  MAX_FOLDER_PATH_DEPTH,
  canCreateFolderIn,
  canMoveFolder,
  countLibraryItems,
  isDescendantOrSelf,
  type MediaFolder,
} from '@/utils/mediaFolders';
import {
  toDbId,
  toLibraryFolder,
  toLibraryPhoto,
  type LibraryMedia,
  type MediaFolderRow,
  type MediaLibraryProp,
  type MediaRow,
} from '@/utils/mediaLibraryAdapter';

/**
 * The media library's data contract over our IPC (plan #155-P3) — the Builder's
 * `useMediaLibrary` with its API routes and presigned S3 uploads replaced by
 * `@/utils/ipc` and the native import picker.
 *
 * Two rules the Builder's hook also kept: folder moves and creations are
 * guarded here as well as in the browser (the data layer refuses a move into
 * itself or its own subtree, but the depth cap is a UI rule, and a later caller
 * such as a "Move…" action must not bypass it); and a failed envelope is never
 * silent — it refetches so no optimistic state lingers, and it alerts so the
 * user sees why.
 */

const DIALOG_TITLE = 'Media Library';

type Envelope<T = unknown> = { success: boolean; data?: T; error?: string } | null | undefined;

export function useMediaLibrary(): MediaLibraryProp {
  const [photos, setPhotos] = useState<LibraryMedia[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const foldersRef = useLatest(folders);
  const firstLoadDone = useRef(false);

  const fetchPhotos = useCallback(async () => {
    const [mediaResult, folderResult] = (await Promise.all([getMedia(), getMediaFolders()])) as [
      Envelope<MediaRow[]>,
      Envelope<MediaFolderRow[]>,
    ];
    if (mediaResult?.success && Array.isArray(mediaResult.data)) {
      setPhotos(mediaResult.data.map(toLibraryPhoto));
    }
    if (folderResult?.success && Array.isArray(folderResult.data)) {
      setFolders(folderResult.data.map(toLibraryFolder));
    }
    if (!firstLoadDone.current) {
      firstLoadDone.current = true;
      setLoading(false);
    }
  }, []);

  // Load on mount. An inner async function with a cancel flag, the shape the
  // Version History modal uses: the effect body itself sets no state.
  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      if (cancelled) return;
      await fetchPhotos();
    }
    void loadLibrary();
    return () => {
      cancelled = true;
    };
  }, [fetchPhotos]);

  /** Run one write; on a failed envelope alert with the reason and refetch. */
  const run = useCallback(
    async (op: () => Promise<Envelope>): Promise<boolean> => {
      const result = await op();
      if (result?.success) return true;
      await alertDialog(result?.error || 'Something went wrong.', { title: DIALOG_TITLE });
      await fetchPhotos();
      return false;
    },
    [fetchPhotos]
  );

  const refuse = useCallback(async (message: string) => {
    await alertDialog(message, { title: DIALOG_TITLE });
  }, []);

  const depthMessage = `Folders can be ${MAX_FOLDER_PATH_DEPTH} levels deep at most.`;

  const createFolder = useCallback(
    async (name: string, parentId: string | null) => {
      if (!canCreateFolderIn(foldersRef.current, parentId)) {
        await refuse(depthMessage);
        return;
      }
      const ok = await run(() => createMediaFolder({ name, parentId: toDbId(parentId) }));
      if (ok) await fetchPhotos();
    },
    [depthMessage, fetchPhotos, foldersRef, refuse, run]
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      const id = toDbId(folderId);
      if (id === null) return;
      const ok = await run(() => updateMediaFolder(id, { name }));
      if (ok) await fetchPhotos();
    },
    [fetchPhotos, run]
  );

  const moveFolder = useCallback(
    async (folderId: string, parentId: string | null) => {
      const id = toDbId(folderId);
      if (id === null) return;
      const current = foldersRef.current;
      if (!canMoveFolder(current, folderId, parentId)) {
        const intoSelf = parentId !== null && isDescendantOrSelf(current, folderId, parentId);
        await refuse(
          intoSelf ? 'A folder can’t move into itself or its own subfolders.' : depthMessage
        );
        return;
      }
      const ok = await run(() => updateMediaFolder(id, { parent_id: toDbId(parentId) }));
      if (ok) await fetchPhotos();
    },
    [depthMessage, fetchPhotos, foldersRef, refuse, run]
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const id = toDbId(folderId);
      if (id === null) return;
      // The recursive cascade on disk is the truth; refetch rather than mirror it.
      const ok = await run(() => deleteMediaFolder(id));
      if (ok) await fetchPhotos();
    },
    [fetchPhotos, run]
  );

  const movePhoto = useCallback(
    async (mediaId: string, folderId: string | null) => {
      const id = toDbId(mediaId);
      if (id === null) return;
      const nextFolderId = toDbId(folderId);
      const ok = await run(() => updateMedia(id, { folder_id: nextFolderId }));
      if (ok) {
        setPhotos((prev) => prev.map((p) => (p.mediaId === mediaId ? { ...p, folderId } : p)));
      }
    },
    [run]
  );

  const renamePhoto = useCallback(
    async (mediaId: string, name: string) => {
      const id = toDbId(mediaId);
      if (id === null) return;
      const ok = await run(() => updateMedia(id, { name }));
      if (ok) {
        setPhotos((prev) =>
          prev.map((p) => (p.mediaId === mediaId ? { ...p, fileName: name } : p))
        );
      }
    },
    [run]
  );

  const deletePhoto = useCallback(
    async (mediaId: string) => {
      const id = toDbId(mediaId);
      if (id === null) return;
      const ok = await run(() => deleteMedia(id));
      if (ok) setPhotos((prev) => prev.filter((p) => p.mediaId !== mediaId));
    },
    [run]
  );

  const importMedia = useCallback(
    async (folderId: string | null) => {
      const result = (await importMediaIpc({ folderId: toDbId(folderId) })) as Envelope<MediaRow[]>;
      if (!result?.success) {
        await alertDialog(result?.error || 'Import failed.', { title: DIALOG_TITLE });
        return;
      }
      // A cancelled picker resolves with an empty list — nothing to reload.
      if (Array.isArray(result.data) && result.data.length > 0) await fetchPhotos();
    },
    [fetchPhotos]
  );

  const totalCount = countLibraryItems(photos, folders);

  return {
    photos,
    folders,
    loading,
    totalCount,
    atCap: totalCount >= LIBRARY_ITEM_CAP,
    fetchPhotos,
    deletePhoto,
    renamePhoto,
    movePhoto,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    importMedia,
  };
}
