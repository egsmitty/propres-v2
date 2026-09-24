import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';
import { useEditorStore } from '@/store/editorStore';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { useClearWhenMissing } from '@/hooks/useClearWhenMissing';
import ContextMenu from '@/components/shared/ContextMenu';
import MediaTilePreview from '@/components/library/MediaTilePreview';
import {
  MediaLibraryBrowser,
  confirmDeleteMedia,
  type MediaLibraryBrowserHandle,
} from '@/components/library/MediaLibraryBrowser';
import { promptDialog, showDialog } from '@/utils/dialog';
import { getSectionTypeLabel } from '@/utils/sectionTypes';
import { insertMediaSlideIntoCurrentPresentation } from '@/utils/presentationCommands';
import { buildFolderPath, listFoldersDepthFirst } from '@/utils/mediaFolders';
import type { LibraryMedia } from '@/utils/mediaLibraryAdapter';

/**
 * The media library as an overlay (plans #155-P3, #155-P4), hosting the ported
 * browser over the `useMediaLibrary` hook, with a detail pane whose explicit
 * buttons replace the old panel's Use / More / Delete footer (#156). The pane
 * calls exactly what the panel called — the store's background setters and
 * `insertMediaSlideIntoCurrentPresentation` — with the raw row's numeric id,
 * and closes the library after applying, as the panel did.
 *
 * Two deliberate departures from the app's other modals:
 * - **No dimming, no click-outside close.** Ethan kept dragging a tile onto the
 *   canvas or filmstrip (charter D.5); a blocking backdrop would make that
 *   impossible. The wrapper is `pointer-events-none`, the panel
 *   `pointer-events-auto`, and it closes on its X or Escape.
 * - **Escape is a chain.** Consumed in the window's capture phase with
 *   `preventDefault()` only (plan L1) — never `stopPropagation`, or the search
 *   box and `ContextMenu` inside would never see the key. An open dialog owns
 *   the key (else Escape in a rename box would close the whole library); then a
 *   tile's context menu; then the browser's own popovers; then the library.
 */

interface PaneAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const actionButton =
  'w-full text-left px-3 py-2 text-xs font-medium rounded-md border border-border-default bg-bg-app text-text-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed';
const dangerButton =
  'w-full text-left px-3 py-2 text-xs font-medium rounded-md border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20';

export default function MediaLibraryModal() {
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen);
  const presentation = useEditorStore((s) => s.presentation);
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId);
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId);
  const setSlideBackground = useEditorStore((s) => s.setSlideBackground);
  const setSectionBackground = useEditorStore((s) => s.setSectionBackground);

  const mediaLibrary = useMediaLibrary();
  const browserRef = useRef<MediaLibraryBrowserHandle>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [tileMenu, setTileMenu] = useState<{ photo: LibraryMedia; x: number; y: number } | null>(
    null
  );

  const selected = mediaLibrary.photos.find((p) => p.mediaId === selectedMediaId) ?? null;
  useClearWhenMissing(selectedMediaId, selected !== null, () => setSelectedMediaId(null));

  const selectedSection =
    presentation?.sections?.find((section: { id: string }) => section.id === selectedSectionId) ??
    null;
  const sectionLabel = selectedSection ? getSectionTypeLabel(selectedSection.type) : 'Section';

  const close = () => setMediaLibraryOpen(false);

  const insertSlide = async (photo: LibraryMedia) => {
    const inserted = await insertMediaSlideIntoCurrentPresentation(photo.raw);
    if (inserted) close();
  };

  const rename = async (photo: LibraryMedia) => {
    const name = await promptDialog('Rename media item:', photo.fileName, {
      title: 'Rename Media',
      confirmLabel: 'Rename',
      requireValue: 'This item needs a name.',
    });
    if (name && name !== photo.fileName) await mediaLibrary.renamePhoto(photo.mediaId, name);
  };

  const move = async (photo: LibraryMedia) => {
    // Nested folders need their path, not the bare name, to be told apart.
    const options = [
      { value: 'root', label: 'Library Root' },
      ...listFoldersDepthFirst(mediaLibrary.folders).map(({ folder, path }) => ({
        value: folder.folderId,
        label: ['ALL', ...path].join(' > '),
      })),
    ];
    const result = await showDialog({
      title: 'Move Media',
      description: `Choose where "${photo.fileName}" should live.`,
      fields: [
        {
          name: 'folderId',
          label: 'Folder',
          type: 'select',
          defaultValue: photo.folderId ?? 'root',
          options,
        },
      ],
      actions: [
        { label: 'Cancel', value: null, cancel: true },
        { label: 'Move', value: 'confirm', primary: true },
      ],
    });
    if (!result || result.action !== 'confirm') return;
    const chosen = result.values?.folderId;
    await mediaLibrary.movePhoto(
      photo.mediaId,
      chosen === 'root' || chosen == null ? null : String(chosen)
    );
  };

  const remove = async (photo: LibraryMedia) => {
    if (await confirmDeleteMedia(photo)) await mediaLibrary.deletePhoto(photo.mediaId);
  };

  const actionsFor = (photo: LibraryMedia): PaneAction[] => [
    {
      label: 'Set slide background',
      disabled: !selectedSectionId || !selectedSlideId,
      onClick: () => {
        setSlideBackground(selectedSectionId, selectedSlideId, photo.raw.id);
        close();
      },
    },
    {
      label: `Set ${sectionLabel} background`,
      disabled: !selectedSection,
      onClick: () => {
        setSectionBackground(selectedSectionId, photo.raw.id);
        close();
      },
    },
    {
      label: 'Insert as media slide',
      disabled: !selectedSection,
      onClick: () => void insertSlide(photo),
    },
    { label: 'Rename…', onClick: () => void rename(photo) },
    { label: 'Move to…', onClick: () => void move(photo) },
    { label: 'Delete', danger: true, onClick: () => void remove(photo) },
  ];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // A dialog above us owns Escape; leave the event untouched for its host.
      if (useDialogStore.getState().dialog) return;
      e.preventDefault();
      if (tileMenu) {
        setTileMenu(null);
        return;
      }
      if (browserRef.current?.consumeEscape()) return;
      setMediaLibraryOpen(false);
    }
    // Capture phase: consumed before the Editor's stop-presenting listener (L1).
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setMediaLibraryOpen, tileMenu]);

  const folderPath = selected
    ? buildFolderPath(mediaLibrary.folders, selected.folderId)
        .map((f) => f.name)
        .join(' / ')
    : '';

  return (
    <div
      data-media-library-overlay="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-library-title"
        className="pointer-events-auto bg-bg-surface border border-border-default rounded-[10px] shadow-[0_24px_48px_rgba(0,0,0,0.4)] w-[min(1040px,94vw)] max-h-[85vh] flex flex-col p-4 gap-3"
      >
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-text-secondary" />
            <h2 id="media-library-title" className="text-sm font-semibold text-text-primary">
              Media Library
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close media library"
            onClick={close}
            className="flex items-center justify-center w-7 h-7 rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-4 min-h-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <MediaLibraryBrowser
              ref={browserRef}
              mediaLibrary={mediaLibrary}
              onPhotoClick={(photo) => setSelectedMediaId(photo.mediaId)}
              onPhotoContextMenu={(photo, x, y) => {
                setSelectedMediaId(photo.mediaId);
                setTileMenu({ photo, x, y });
              }}
              selectedMediaId={selectedMediaId}
              columns={4}
              gridMaxHeightClass="max-h-[60vh]"
            />
          </div>

          <aside
            data-testid="media-detail-pane"
            className="w-[280px] shrink-0 border-l border-border-subtle pl-4 flex flex-col gap-3 overflow-y-auto"
          >
            {selected ? (
              <>
                <div className="aspect-video rounded-lg overflow-hidden border border-border-default bg-bg-canvas">
                  <MediaTilePreview media={selected} />
                </div>
                <div className="min-w-0">
                  <p
                    data-testid="media-pane-name"
                    className="text-sm font-semibold text-text-primary truncate"
                  >
                    {selected.fileName}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
                    <span className="uppercase tracking-wide px-1.5 py-0.5 rounded border border-border-subtle">
                      {selected.mediaType === 'video' ? 'Video' : 'Image'}
                    </span>
                    {selected.createdAt && (
                      <span>{new Date(selected.createdAt).toLocaleDateString()}</span>
                    )}
                  </div>
                  <p
                    data-testid="media-pane-path"
                    className="mt-1 text-[11px] text-text-tertiary truncate"
                  >
                    {folderPath || 'ALL'}
                  </p>
                </div>
                <div className="rounded-lg px-3 py-2 bg-bg-app border border-border-default">
                  <p className="text-[11px] uppercase tracking-wide text-text-tertiary">
                    Applying to
                  </p>
                  <p
                    data-testid="media-applying-to"
                    className="text-xs font-medium text-text-primary truncate"
                  >
                    {selectedSection
                      ? `${sectionLabel}: ${selectedSection.title}`
                      : 'Choose a section first'}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {actionsFor(selected).map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      disabled={action.disabled}
                      onClick={action.onClick}
                      className={action.danger ? dangerButton : actionButton}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-tertiary">
                Select a media item to see what you can do with it.
              </p>
            )}
          </aside>
        </div>
      </div>

      {tileMenu && (
        <div className="pointer-events-auto">
          <ContextMenu
            x={tileMenu.x}
            y={tileMenu.y}
            items={actionsFor(tileMenu.photo)}
            onClose={() => setTileMenu(null)}
          />
        </div>
      )}
    </div>
  );
}
