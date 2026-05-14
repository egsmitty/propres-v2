export const SECTION_COLORS = [
  'var(--section-1)',
  'var(--section-2)',
  'var(--section-3)',
  'var(--section-4)',
  'var(--section-5)',
]
const MEDIA_PROTOCOL_SCHEME = 'presenterpro-media'

import { isMediaSlide, normalizeSectionType } from '@/utils/sectionTypes'
import { syncLegacyTextFields } from '@/utils/textBoxes'

export function normalizePresentation(presentation) {
  if (!presentation) return presentation
  const sections = (presentation.sections || []).map((section) => ({
    ...section,
    type: normalizeSectionType(section.type),
    backgroundId: section.backgroundId ?? null,
    slides: (section.slides || []).map((slide) =>
      syncLegacyTextFields({
        ...slide,
        backgroundId: slide.backgroundId ?? null,
        mediaId: slide.mediaId ?? null,
      })
    ),
  }))

  return {
    ...presentation,
    aspectRatio: presentation.aspectRatio || '16:9',
    customAspectWidth: presentation.customAspectWidth ?? null,
    customAspectHeight: presentation.customAspectHeight ?? null,
    sections,
    defaultBackgroundId: null,
    default_background_id: null,
  }
}

export function getPresentationBackgroundId(presentation) {
  return null
}

export function getEffectiveBackgroundId(presentation, sectionId, slide) {
  if (!slide) return null
  if (isMediaSlide(slide)) return null

  const section = presentation?.sections?.find((item) => item.id === sectionId)

  return (
    slide.effectiveBackgroundId ??
    slide.backgroundId ??
    section?.backgroundId ??
    null
  )
}

export function withEffectiveBackground(presentation, sectionId, slide) {
  if (!slide) return slide

  return {
    ...slide,
    sectionId,
    effectiveBackgroundId: getEffectiveBackgroundId(presentation, sectionId, slide),
  }
}

export function fileUrlForPath(filePath) {
  if (!filePath) return ''
  const raw = String(filePath)
  if (new RegExp(`^${MEDIA_PROTOCOL_SCHEME}:\\/\\/`, 'i').test(raw)) return raw

  let normalized = raw

  if (/^file:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      normalized = decodeURIComponent(parsed.pathname)
      if (/^\/[A-Za-z]:/.test(normalized)) {
        normalized = normalized.slice(1)
      }
    } catch {
      normalized = raw
    }
  }

  return `${MEDIA_PROTOCOL_SCHEME}://asset?path=${encodeURIComponent(normalized)}`
}

export function mediaComparisonKey(filePath) {
  if (!filePath) return null
  const normalized = String(filePath).replace(/\\/g, '/')
  const isWindowsPath = /^[A-Za-z]:\//.test(normalized)
  return isWindowsPath ? normalized.toLowerCase() : normalized
}

export function getMediaAssetUrl(media, { preferThumbnail = false } = {}) {
  if (!media) return ''

  if (preferThumbnail) {
    return media.thumbnail_url || media.preview_url || media.file_url || fileUrlForPath(media.thumbnail_path || media.file_path)
  }

  return media.file_url || media.preview_url || fileUrlForPath(media.file_path)
}

export function isVideoMedia(media) {
  return media?.type === 'video'
}
