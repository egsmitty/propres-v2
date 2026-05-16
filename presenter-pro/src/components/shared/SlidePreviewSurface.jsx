import React, { useMemo } from 'react'
import { getEffectiveBackgroundId, getMediaAssetUrl, isVideoMedia } from '@/utils/backgrounds'
import { isMediaSlide } from '@/utils/sectionTypes'
import ScaledSlideText from '@/components/shared/ScaledSlideText'

function BackgroundMedia({ media }) {
  const src = getMediaAssetUrl(media)
  if (!src || media?.file_exists === false) return null

  if (isVideoMedia(media)) {
    return (
      <video
        src={src}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return (
    <img
      src={src}
      alt={media?.name || 'Background'}
      className="absolute inset-0 w-full h-full object-cover"
    />
  )
}

export default function SlidePreviewSurface({
  presentation,
  slide,
  sectionId = null,
  mediaLibrary = [],
  empty = '—',
  shadow = 'none',
  minPaddingX = 4,
  minPaddingY = 4,
  showPlaceholder = true,
  backgroundOverlay = 'rgba(0,0,0,0.18)',
  missingMediaLabel = 'Media slide',
}) {
  const mediaSlide = isMediaSlide(slide)
  const mediaSlideItem = useMemo(
    () => (mediaSlide ? mediaLibrary.find((item) => item.id === slide?.mediaId) || null : null),
    [mediaLibrary, slide]
  )
  const effectiveBackgroundId = useMemo(
    () => (!mediaSlide ? getEffectiveBackgroundId(presentation, sectionId, slide) : null),
    [mediaSlide, presentation, sectionId, slide]
  )
  const backgroundMedia = useMemo(
    () => (!mediaSlideItem ? mediaLibrary.find((item) => item.id === effectiveBackgroundId) || null : null),
    [effectiveBackgroundId, mediaLibrary, mediaSlideItem]
  )

  const hasMediaSlideAsset = Boolean(
    mediaSlideItem &&
    mediaSlideItem.file_exists !== false &&
    getMediaAssetUrl(mediaSlideItem)
  )
  const hasBackgroundAsset = Boolean(
    backgroundMedia &&
    backgroundMedia.file_exists !== false &&
    getMediaAssetUrl(backgroundMedia)
  )

  if (!slide) return null

  return (
    <div className="absolute inset-0 overflow-hidden">
      {hasMediaSlideAsset ? <BackgroundMedia media={mediaSlideItem} /> : null}
      {!mediaSlideItem && hasBackgroundAsset ? <BackgroundMedia media={backgroundMedia} /> : null}
      {!mediaSlideItem && hasBackgroundAsset ? (
        <div
          className="absolute inset-0"
          style={{ background: backgroundOverlay }}
        />
      ) : null}
      {mediaSlide ? null : (
        <div className="absolute inset-0">
          <ScaledSlideText
            presentation={presentation}
            slide={slide}
            empty={empty}
            shadow={shadow}
            minPaddingX={minPaddingX}
            minPaddingY={minPaddingY}
            showPlaceholder={showPlaceholder}
          />
        </div>
      )}
      {mediaSlide && !hasMediaSlideAsset ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-center px-2"
          style={{ color: '#d1d5db', fontSize: 10 }}
        >
          {missingMediaLabel}
        </div>
      ) : null}
    </div>
  )
}
