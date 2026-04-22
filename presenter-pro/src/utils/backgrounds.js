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
  const normalized = String(filePath).replace(/\\/g, '/')
  const encodePath = (value) => value.split('/').map((segment) => encodeURIComponent(segment)).join('/').replace(/%3A/g, ':')

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodePath(normalized)}`
  }

  if (normalized.startsWith('//')) {
    return `file:${encodePath(normalized)}`
  }

  return `file://${encodePath(normalized)}`
}

export function isVideoMedia(media) {
  return media?.type === 'video'
}
