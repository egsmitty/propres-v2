import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { ChevronDown, Folder, FolderUp, Search, Trash2, TriangleAlert } from 'lucide-react';
import ContextMenu from '@/components/shared/ContextMenu';
import MediaTilePreview from '@/components/library/MediaTilePreview';
import { alertDialog, confirmDialog, promptDialog } from '@/utils/dialog';
import { AUTO_SCROLL_STEP_PX, autoScrollDirection } from '@/utils/dragAutoScroll';
import {
  FOLDER_NAME_MAX_LENGTH,
  LIBRARY_ITEM_CAP,
  MAX_FOLDER_PATH_DEPTH,
  buildFolderPath,
  canCreateFolderIn,
  canMoveFolder,
  childFoldersOf,
  collectCascadeDescendants,
  folderNameValid,
  isDescendantOrSelf,
  listFoldersDepthFirst,
  photosIn,
  searchLibraryPhotos,
  type MediaFolder,
} from '@/utils/mediaFolders';
import type { LibraryMedia, MediaKind, MediaLibraryProp } from '@/utils/mediaLibraryAdapter';

/**
 * The media-library browser (plan #155-P3): folder navigation with a breadcrumb
 * and an Explorer-style folder dropdown, recursive search, the item cap with a
 * live counter, drag-and-drop between folders with a blocked-move hint and edge
 * auto-scroll, cascade delete with exact counts, and our All / Images / Videos
 * filter.
 *
 * Ported from Motion-Worship Builder's `MediaLibraryBrowser.tsx` (#327) and
 * reformatted to this app: our design tokens instead of the Builder's two-way
 * surface fork, our `ContextMenu` and dialogs instead of its portals, lucide
 * glyphs, `aspect-video` tiles for 16:9 backgrounds, the native import picker
 * instead of uploads, and our drag MIME so Canvas and Filmstrip drops keep
 * working. Depth copy derives from the constant. The root has no click handler
 * — `ContextMenu` closes itself.
 */

/** The MIME Canvas and Filmstrip already accept; the payload is the numeric id as a string. */
export const MEDIA_DRAG_TYPE = 'application/presenterpro-media-id';
export const MEDIA_FOLDER_DRAG_TYPE = 'application/presenterpro-media-folder-id';

export interface MediaLibraryBrowserHandle {
  /**
   * Let the host's Escape chain close the browser's own popovers first —
   * dropdown, then context menu, then search. Returns true when it did.
   */
  consumeEscape: () => boolean;
}

interface MediaLibraryBrowserProps {
  mediaLibrary: MediaLibraryProp;
  /** Single click on a media tile — the host decides what selection means. */
  onPhotoClick: (photo: LibraryMedia) => void;
  selectedMediaId?: string | null;
  columns?: 3 | 4;
  gridMaxHeightClass?: string;
  /** Hover trash + confirm on media tiles. */
  showPhotoDelete?: boolean;
}

type DragItem = { kind: 'photo' | 'folder'; id: string } | null;
type KindFilter = 'all' | MediaKind;

const DEPTH_MESSAGE = `Folders can be ${MAX_FOLDER_PATH_DEPTH} levels deep at most`;
const NEAR_CAP_WITHIN = 10;

const chipButton =
  'shrink-0 px-2 py-1 text-[11px] font-medium rounded-md border border-border-default bg-bg-app text-text-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed';
const filterChip = (active: boolean) =>
  `shrink-0 px-2 py-1 text-[11px] font-medium rounded-md border ${
    active
      ? 'border-accent bg-accent/12 text-accent'
      : 'border-border-default bg-bg-app text-text-secondary hover:bg-bg-hover'
  }`;
const circleButton =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary';
const crumbBar =
  'relative flex items-center rounded-full border border-border-default bg-bg-app py-1 pl-3 pr-1 text-xs';
const crumbIdle = 'rounded px-1 text-text-secondary hover:text-text-primary';
const crumbCurrent = 'rounded px-1 font-semibold text-text-primary';
const dropTargetClass = 'border-accent bg-accent/12';
const folderTileClass =
  'flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-border-default bg-bg-app hover:border-accent';
const upTileClass =
  'flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-default bg-bg-app hover:border-accent';
const mediaTileClass = (selected: boolean) =>
  `w-full aspect-video rounded-lg overflow-hidden border bg-bg-canvas hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent ${
    selected ? 'border-accent ring-2 ring-accent' : 'border-border-default'
  }`;
const tileLabel = 'max-w-[92%] truncate text-[11px] font-medium text-text-primary';
const hintClass = 'col-span-full py-6 text-center text-sm text-text-tertiary';

/** Ask for a folder name until it is valid or the user cancels; never loses typed text. */
async function askFolderName(
  title: string,
  confirmLabel: string,
  initial: string
): Promise<string | null> {
  let seed = initial;
  for (;;) {
    const answer = await promptDialog('Folder name:', seed, {
      title,
      confirmLabel,
      placeholder: 'e.g. Backgrounds',
      requireValue: 'A folder needs a name.',
    });
    if (answer == null) return null;
    if (folderNameValid(answer)) return answer.trim();
    seed = answer;
    await alertDialog(`Folder names can be up to ${FOLDER_NAME_MAX_LENGTH} characters.`, {
      title,
    });
  }
}

export const MediaLibraryBrowser = forwardRef<MediaLibraryBrowserHandle, MediaLibraryBrowserProps>(
  function MediaLibraryBrowser(
    {
      mediaLibrary,
      onPhotoClick,
      selectedMediaId = null,
      columns = 4,
      gridMaxHeightClass = 'max-h-[60vh]',
      showPhotoDelete = true,
    },
    ref
  ) {
    const folderList: MediaFolder[] = mediaLibrary.folders;

    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [kind, setKind] = useState<KindFilter>('all');
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
      folderId: string;
      x: number;
      y: number;
    } | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    /**
     * Why the hovered target refuses the dragged folder — native drags suppress
     * title tooltips, so the no-drop cursor alone never explains. Shown in a
     * permanently reserved row above the grid (visibility-toggled, never
     * mounted/unmounted, so revealing it cannot shift the layout).
     */
    const [dragBlocked, setDragBlocked] = useState<string | null>(null);
    const dragItem = useRef<DragItem>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    /** Edge auto-scroll state: direction, RAF handle, last dragover timestamp. */
    const autoScrollState = useRef({ dir: 0 as -1 | 0 | 1, raf: 0, lastSeen: 0 });

    const totalCount = mediaLibrary.totalCount;
    const atCap = mediaLibrary.atCap;
    const nearCap = totalCount >= LIBRARY_ITEM_CAP - NEAR_CAP_WITHIN;

    const byKind = (photo: LibraryMedia) => kind === 'all' || photo.mediaType === kind;
    const searching = searchOpen && query.trim().length > 0;
    const path = buildFolderPath(folderList, currentFolderId);
    const currentFolders = childFoldersOf(folderList, currentFolderId);
    const currentPhotos = photosIn(mediaLibrary.photos, currentFolderId).filter(byKind);
    const searchResults = searching
      ? searchLibraryPhotos(mediaLibrary.photos, query).filter(byKind)
      : [];
    const canCreateHere = !atCap && canCreateFolderIn(folderList, currentFolderId);
    const parentOfCurrent = path.length > 0 ? (path[path.length - 1]?.parentId ?? null) : null;
    const showLoading = mediaLibrary.loading && mediaLibrary.photos.length === 0;

    const navigateTo = (folderId: string | null) => {
      setCurrentFolderId(folderId);
      setDropdownOpen(false);
      setContextMenu(null);
    };

    const closeSearch = () => {
      setSearchOpen(false);
      setQuery('');
    };

    useImperativeHandle(ref, () => ({
      consumeEscape: () => {
        if (dropdownOpen) {
          setDropdownOpen(false);
          return true;
        }
        if (contextMenu) {
          setContextMenu(null);
          return true;
        }
        if (searchOpen) {
          closeSearch();
          return true;
        }
        return false;
      },
    }));

    // Our addition: the dropdown closes on a click anywhere outside it.
    useEffect(() => {
      if (!dropdownOpen) return;
      function onMouseDown(e: MouseEvent) {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      }
      document.addEventListener('mousedown', onMouseDown);
      return () => document.removeEventListener('mousedown', onMouseDown);
    }, [dropdownOpen]);

    const beginDrag = (item: NonNullable<DragItem>) => {
      dragItem.current = item;
    };
    const stopAutoScroll = () => {
      const s = autoScrollState.current;
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.dir = 0;
    };
    useEffect(() => stopAutoScroll, []);

    /**
     * Native drags never scroll inner overflow containers, so a tile dragged
     * from low in the grid could never reach a target scrolled out of view.
     * While the pointer rides an edge zone, step immediately and run a RAF loop
     * for smooth continuous scroll; the loop self-stops when dragover events
     * stop arriving.
     */
    const handleGridDragScroll = (e: DragEvent) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dir = autoScrollDirection(rect.top, rect.bottom, e.clientY);
      const s = autoScrollState.current;
      s.dir = dir;
      s.lastSeen = Date.now();
      if (dir === 0) return;
      el.scrollTop += dir * AUTO_SCROLL_STEP_PX;
      if (!s.raf) {
        const tick = () => {
          const st = autoScrollState.current;
          const grid = gridRef.current;
          if (!grid || st.dir === 0 || Date.now() - st.lastSeen > 250) {
            st.raf = 0;
            return;
          }
          grid.scrollTop += st.dir * AUTO_SCROLL_STEP_PX;
          st.raf = requestAnimationFrame(tick);
        };
        s.raf = requestAnimationFrame(tick);
      }
    };

    const endDrag = () => {
      dragItem.current = null;
      setDropTarget(null);
      setDragBlocked(null);
      stopAutoScroll();
    };

    const canDropOn = (targetFolderId: string | null): boolean => {
      const item = dragItem.current;
      if (!item) return false;
      if (item.kind === 'photo') return true;
      return canMoveFolder(folderList, item.id, targetFolderId);
    };

    const noteBlockedFolderHover = (targetFolderId: string | null) => {
      const item = dragItem.current;
      if (!item || item.kind !== 'folder') return;
      const self =
        targetFolderId !== null && isDescendantOrSelf(folderList, item.id, targetFolderId);
      setDragBlocked(self ? 'A folder can’t move into itself.' : `${DEPTH_MESSAGE}.`);
    };

    const dropOn = (targetFolderId: string | null) => {
      const item = dragItem.current;
      if (!item || !canDropOn(targetFolderId)) {
        endDrag();
        return;
      }
      if (item.kind === 'photo') {
        void mediaLibrary.movePhoto(item.id, targetFolderId);
      } else {
        void mediaLibrary.moveFolder(item.id, targetFolderId);
      }
      endDrag();
    };

    const dragOverTarget = (key: string, targetFolderId: string | null) => (e: DragEvent) => {
      if (canDropOn(targetFolderId)) {
        e.preventDefault();
        setDropTarget(key);
        setDragBlocked(null);
      } else {
        noteBlockedFolderHover(targetFolderId);
      }
    };
    const dragLeaveTarget = () => {
      setDropTarget(null);
      setDragBlocked(null);
    };
    const dropOnTarget = (targetFolderId: string | null) => (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropOn(targetFolderId);
    };
    const dropHighlight = (key: string) => (dropTarget === key ? dropTargetClass : '');

    const createFolderHere = async () => {
      const name = await askFolderName('New Folder', 'Create', '');
      if (name) await mediaLibrary.createFolder(name, currentFolderId);
    };

    const renameFolder = async (folderId: string) => {
      setContextMenu(null);
      const folder = folderList.find((f) => f.folderId === folderId);
      const name = await askFolderName('Rename Folder', 'Rename', folder?.name ?? '');
      if (name && name !== folder?.name) await mediaLibrary.renameFolder(folderId, name);
    };

    const deleteFolder = async (folderId: string) => {
      setContextMenu(null);
      const folder = folderList.find((f) => f.folderId === folderId);
      const cascade = collectCascadeDescendants(folderList, mediaLibrary.photos, folderId);
      const mediaCount = cascade.photoIds.length;
      const subfolderCount = cascade.folderIds.length - 1;
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
      const message =
        mediaCount + subfolderCount > 0
          ? `Delete folder "${folder?.name ?? ''}"? This permanently removes ${plural(
              mediaCount,
              'media item'
            )} and ${plural(
              subfolderCount,
              'subfolder'
            )} inside it from your library. The files on your hard drive will not be deleted.`
          : `Delete folder "${folder?.name ?? ''}"? It is empty.`;
      const ok = await confirmDialog(message, {
        title: 'Delete Folder',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await mediaLibrary.deleteFolder(folderId);
      if (currentFolderId && cascade.folderIds.includes(currentFolderId)) navigateTo(null);
    };

    const deletePhoto = async (photo: LibraryMedia) => {
      const ok = await confirmDialog(
        `Delete "${photo.fileName}" from the media library? The file on your hard drive will not be deleted.`,
        { title: 'Delete Media', confirmLabel: 'Delete', danger: true }
      );
      if (ok) await mediaLibrary.deletePhoto(photo.mediaId);
    };

    const gridColsClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-4';

    const renderMediaTile = (photo: LibraryMedia, caption?: string) => (
      <div key={photo.mediaId} className="relative group">
        <button
          type="button"
          data-media-tile={photo.mediaId}
          aria-pressed={photo.mediaId === selectedMediaId}
          title={photo.fileName}
          draggable
          onClick={() => onPhotoClick(photo)}
          onDragStart={(e) => {
            beginDrag({ kind: 'photo', id: photo.mediaId });
            e.dataTransfer?.setData?.(MEDIA_DRAG_TYPE, photo.mediaId);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={endDrag}
          className={mediaTileClass(photo.mediaId === selectedMediaId)}
        >
          <MediaTilePreview media={photo} />
        </button>
        {caption !== undefined && (
          <span
            data-testid="media-path-caption"
            className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-on-dark-10"
          >
            {caption}
          </span>
        )}
        {showPhotoDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void deletePhoto(photo);
            }}
            className="absolute top-1 right-1 p-1 rounded bg-danger/80 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-danger"
            title="Delete from library"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    );

    return (
      <div className="space-y-2" data-media-library-browser="true">
        {/* Top controls: import, new folder, filter, search, live counter */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void mediaLibrary.importMedia(currentFolderId)}
            disabled={atCap}
            title={atCap ? 'Library is full' : 'Import images or videos into this folder'}
            className={chipButton}
          >
            + Import
          </button>
          <button
            type="button"
            onClick={() => void createFolderHere()}
            disabled={!canCreateHere}
            title={atCap ? 'Library is full' : !canCreateHere ? DEPTH_MESSAGE : undefined}
            className={chipButton}
          >
            + Folder
          </button>
          <div className="ml-1 flex items-center gap-1" role="group" aria-label="Filter by type">
            {(
              [
                ['all', 'All'],
                ['image', 'Images'],
                ['video', 'Videos'],
              ] as Array<[KindFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={filterChip(kind === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`flex items-center min-w-0 ${searchOpen ? 'flex-1' : ''}`}>
            <button
              type="button"
              aria-label="Search media"
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              className={circleButton}
            >
              <Search size={12} />
            </button>
            {searchOpen && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch();
                }}
                placeholder="Search media…"
                className="ml-1.5 w-0 min-w-0 flex-1 rounded-md bg-bg-app border border-border-default px-2 py-0.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>
          {!searchOpen && (
            <span
              data-testid="media-count"
              className={`ml-auto shrink-0 text-[11px] tabular-nums ${
                nearCap ? 'text-danger font-semibold' : 'text-text-tertiary'
              }`}
            >
              {totalCount} / {LIBRARY_ITEM_CAP}
            </span>
          )}
        </div>

        {/* Breadcrumb pill bar + Explorer-style folder dropdown */}
        <div data-testid="media-breadcrumb" className={crumbBar} ref={dropdownRef}>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
            <button
              type="button"
              onClick={() => navigateTo(null)}
              onDragOver={dragOverTarget('crumb-root', null)}
              onDragLeave={dragLeaveTarget}
              onDrop={dropOnTarget(null)}
              className={`${currentFolderId === null ? crumbCurrent : crumbIdle} ${
                dropTarget === 'crumb-root' ? 'bg-accent text-text-on-accent' : ''
              }`}
            >
              ALL
            </button>
            {path.map((folder, i) => {
              const isLast = i === path.length - 1;
              return (
                <span key={folder.folderId} className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="flex items-center px-0.5 text-[13px] font-semibold leading-none text-text-tertiary"
                  >
                    {'>'}
                  </span>
                  {isLast ? (
                    <span className={`truncate ${crumbCurrent}`}>{folder.name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateTo(folder.folderId)}
                      onDragOver={dragOverTarget(`crumb-${folder.folderId}`, folder.folderId)}
                      onDragLeave={dragLeaveTarget}
                      onDrop={dropOnTarget(folder.folderId)}
                      className={`truncate ${crumbIdle} ${
                        dropTarget === `crumb-${folder.folderId}`
                          ? 'bg-accent text-text-on-accent'
                          : ''
                      }`}
                    >
                      {folder.name}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Browse folders"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((open) => !open)}
            className={`ml-1.5 ${circleButton}`}
          >
            <ChevronDown size={12} />
          </button>
          {dropdownOpen && (
            <div
              data-testid="media-folder-dropdown"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-bg-surface p-1 shadow-[0_18px_42px_rgba(8,14,30,0.16)]"
            >
              <button
                type="button"
                onClick={() => navigateTo(null)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bg-hover ${
                  currentFolderId === null ? 'text-accent font-semibold' : 'text-text-primary'
                }`}
              >
                <Folder size={12} className="shrink-0 text-accent" />
                ALL
              </button>
              {listFoldersDepthFirst(folderList).map(({ folder, path: namePath }) => (
                <button
                  key={folder.folderId}
                  type="button"
                  onClick={() => navigateTo(folder.folderId)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bg-hover ${
                    currentFolderId === folder.folderId
                      ? 'text-accent font-semibold'
                      : 'text-text-primary'
                  }`}
                >
                  <Folder size={12} className="shrink-0 text-accent" />
                  <span className="truncate">
                    <span className="text-text-tertiary">
                      {['ALL', ...namePath.slice(0, -1)].join(' > ')}
                      {' > '}
                    </span>
                    {namePath[namePath.length - 1]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Blocked-drop notice: ALWAYS present (fixed height), visibility-toggled */}
        <div
          data-testid="drop-blocked-hint"
          aria-live="polite"
          className={`flex min-h-[20px] items-center gap-1.5 px-1 text-xs font-bold text-danger ${
            dragBlocked ? 'visible' : 'invisible'
          }`}
        >
          <TriangleAlert size={14} className="shrink-0" />
          {dragBlocked ?? ''}
        </div>

        {/* Cap warning */}
        {atCap && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/60 bg-danger/10 p-2 text-xs text-danger">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>{`Your library is full (${LIBRARY_ITEM_CAP} of ${LIBRARY_ITEM_CAP}).`}</strong>{' '}
              Delete media or folders before adding more — folders count toward the limit.
            </span>
          </div>
        )}

        {/* Grid */}
        {showLoading ? (
          <div className="py-6 text-center text-sm text-text-tertiary">Loading…</div>
        ) : (
          <div
            ref={gridRef}
            data-testid="media-library-grid"
            onDragOver={handleGridDragScroll}
            onDrop={stopAutoScroll}
            className={`grid ${gridColsClass} gap-1.5 ${gridMaxHeightClass} overflow-y-auto p-0.5`}
          >
            {searching ? (
              searchResults.length === 0 ? (
                <div className={hintClass}>No media matches &ldquo;{query.trim()}&rdquo;.</div>
              ) : (
                searchResults.map((photo) =>
                  renderMediaTile(
                    photo,
                    buildFolderPath(folderList, photo.folderId)
                      .map((f) => f.name)
                      .join(' / ') || 'ALL'
                  )
                )
              )
            ) : (
              <>
                {currentFolderId !== null && (
                  <button
                    type="button"
                    title="Move up a level — drop items here to move them up"
                    onClick={() => navigateTo(parentOfCurrent)}
                    onDragOver={dragOverTarget('up', parentOfCurrent)}
                    onDragLeave={dragLeaveTarget}
                    onDrop={dropOnTarget(parentOfCurrent)}
                    className={`${upTileClass} ${dropHighlight('up')}`}
                  >
                    <FolderUp size={28} className="text-text-secondary" />
                    <span className={tileLabel}>Move up</span>
                  </button>
                )}
                {currentFolders.map((folder) => (
                  <button
                    key={folder.folderId}
                    type="button"
                    data-folder-tile={folder.folderId}
                    title="Click to open — drag to move"
                    draggable
                    onClick={() => navigateTo(folder.folderId)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ folderId: folder.folderId, x: e.clientX, y: e.clientY });
                    }}
                    onDragStart={(e) => {
                      beginDrag({ kind: 'folder', id: folder.folderId });
                      e.dataTransfer?.setData?.(MEDIA_FOLDER_DRAG_TYPE, folder.folderId);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={dragOverTarget(`folder-${folder.folderId}`, folder.folderId)}
                    onDragLeave={dragLeaveTarget}
                    onDrop={dropOnTarget(folder.folderId)}
                    className={`${folderTileClass} ${dropHighlight(`folder-${folder.folderId}`)}`}
                  >
                    <Folder size={28} className="text-accent" />
                    <span className={tileLabel}>{folder.name}</span>
                  </button>
                ))}
                {currentPhotos.map((photo) => renderMediaTile(photo))}
                {currentFolders.length === 0 &&
                  currentPhotos.length === 0 &&
                  (currentFolderId !== null ? (
                    <div className={hintClass}>This folder is empty.</div>
                  ) : (
                    <div className={hintClass}>No media yet. Import some to get started.</div>
                  ))}
              </>
            )}
          </div>
        )}

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={[
              { label: 'Open', onClick: () => navigateTo(contextMenu.folderId) },
              { label: 'Rename', onClick: () => void renameFolder(contextMenu.folderId) },
              { divider: true },
              {
                label: 'Delete',
                onClick: () => void deleteFolder(contextMenu.folderId),
                danger: true,
              },
            ]}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }
);

export default MediaLibraryBrowser;
