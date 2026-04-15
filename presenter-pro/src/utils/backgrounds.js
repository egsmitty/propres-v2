export const SECTION_COLORS = [
  'var(--section-1)',
  'var(--section-2)',
  'var(--section-3)',
  'var(--section-4)',
  'var(--section-5)',
]

export function normalizePresentation(presentation) {
  if (!presentation) return presentation

  const defaultBackgroundId =
    presentation.defaultBackgroundId ?? presentation.default_background_id ?? null

  return {
    ...presentation,
    defaultBackgroundId,
    default_background_id: defaultBackgroundId,
  }
}

export function getPresentationBackgroundId(presentation) {
  return presentation?.defaultBackgroundId ?? presentation?.default_background_id ?? null
}

export function getEffectiveBackgroundId(presentation, sectionId, slide) {
  if (!slide) return null

  const section = presentation?.sections?.find((item) => item.id === sectionId)

  return (
    slide.effectiveBackgroundId ??
    slide.backgroundId ??
    section?.backgroundId ??
    getPresentationBackgroundId(presentation) ??
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
  const normalized = filePath.replace(/#/g, '%23').replace(/\?/g, '%3F')
  return `file://${normalized}`
}

export function isVideoMedia(media) {
  return media?.type === 'video'
}
