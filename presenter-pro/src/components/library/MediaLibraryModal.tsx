import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { useClearWhenMissing } from '@/hooks/useClearWhenMissing';
import {
  MediaLibraryBrowser,
  type MediaLibraryBrowserHandle,
} from '@/components/library/MediaLibraryBrowser';

/**
 * The media library as an overlay (plan #155-P3), hosting the ported browser
 * over the `useMediaLibrary` hook. Not mounted by the Editor until P4 completes
 * the detail-pane actions; until then the 320px panel stays the live surface.
 *
 * Two deliberate departures from the app's other modals:
 * - **No dimming, no click-outside close.** Ethan kept dragging a tile onto the
 *   canvas or filmstrip (charter D.5); a blocking backdrop would make that
 *   impossible. The wrapper is `pointer-events-none`, the panel
 *   `pointer-events-auto`, and it closes on its X or Escape.
 * - **Escape is a chain.** Consumed in the window's capture phase with
 *   `preventDefault()` only (plan L1) — never `stopPropagation`, or the search
 *   box and `ContextMenu` inside would never see the key. An open dialog owns
 *   the key (else Escape in a rename box would close the whole library); then
 *   the browser's own popovers; then the library closes.
 */
export default function MediaLibraryModal() {
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen);
  const mediaLibrary = useMediaLibrary();
  const browserRef = useRef<MediaLibraryBrowserHandle>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  useClearWhenMissing(
    selectedMediaId,
    mediaLibrary.photos.some((p) => p.mediaId === selectedMediaId),
    () => setSelectedMediaId(null)
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // A dialog above us owns Escape; leave the event untouched for its host.
      if (useDialogStore.getState().dialog) return;
      e.preventDefault();
      if (browserRef.current?.consumeEscape()) return;
      setMediaLibraryOpen(false);
    }
    // Capture phase: consumed before the Editor's stop-presenting listener (L1).
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setMediaLibraryOpen]);

  return (
    <div
      data-media-library-overlay="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-library-title"
        className="pointer-events-auto bg-bg-surface border border-border-default rounded-[10px] shadow-[0_24px_48px_rgba(0,0,0,0.4)] w-[min(920px,92vw)] max-h-[85vh] flex flex-col p-4 gap-3"
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
            onClick={() => setMediaLibraryOpen(false)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 overflow-hidden">
          <MediaLibraryBrowser
            ref={browserRef}
            mediaLibrary={mediaLibrary}
            onPhotoClick={(photo) => setSelectedMediaId(photo.mediaId)}
            selectedMediaId={selectedMediaId}
            columns={4}
            gridMaxHeightClass="max-h-[60vh]"
          />
        </div>
      </div>
    </div>
  );
}
