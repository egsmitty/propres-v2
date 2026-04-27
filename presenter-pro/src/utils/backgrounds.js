export const SECTION_COLORS = [
  'var(--section-1)',
  'var(--section-2)',
  'var(--section-3)',
  'var(--section-4)',
  'var(--section-5)',
]

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
  if (/^file:\/\//i.test(raw)) return raw

  const normalized = raw.replace(/\\/g, '/')
  const encoded = encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encoded}`
  }

  if (normalized.startsWith('//')) {
    return `file:${encoded}`
  }

  return normalized.startsWith('/')
    ? `file://${encoded}`
    : `file:///${encoded}`
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
