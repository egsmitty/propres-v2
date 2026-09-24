import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { LibraryMedia } from '@/utils/mediaLibraryAdapter';

/**
 * One library tile's picture (plan #155-P3). Thumbnail-first images; videos as
 * a paused, metadata-only element that plays on hover and pauses on leave — a
 * four-column library never decodes every visible video at once (the old
 * panel's autoplaying tiles were fine at two columns). A file the disk no
 * longer has shows "Missing File", keyed on the row's `file_exists`, because
 * the URL resolver always returns something for a path.
 */
export default function MediaTilePreview({ media }: { media: LibraryMedia }) {
  if (!media.fileExists || !media.urls.small) {
    return (
      <div
        data-testid="media-tile-missing"
        className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center bg-bg-canvas"
      >
        <ImageIcon size={20} className="text-on-dark-5" />
        <span className="text-on-dark-8 text-[10px] font-semibold">Missing File</span>
      </div>
    );
  }

  if (media.mediaType === 'video') {
    const poster = media.urls.small !== media.urls.large ? media.urls.small : undefined;
    return (
      <video
        data-testid="media-tile-video"
        src={media.urls.large}
        poster={poster}
        preload="metadata"
        muted
        loop
        playsInline
        className="w-full h-full object-cover"
        onMouseEnter={(e) => {
          void e.currentTarget.play()?.catch(() => {});
        }}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
        }}
      />
    );
  }

  return (
    <img
      src={media.urls.small}
      alt={media.altText || media.fileName}
      loading="lazy"
      className="w-full h-full object-cover"
    />
  );
}
