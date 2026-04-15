import { SECTION_COLORS } from '@/utils/backgrounds'
import { uuid } from '@/utils/uuid'

export const SECTION_TYPE_META = {
  song: {
    label: 'Song',
    contentLabel: 'Lyrics',
    defaultSectionTitle: 'New Song',
    defaultSlideLabel: 'Lyrics',
  },
  announcement: {
    label: 'Announcement',
    contentLabel: 'Text',
    defaultSectionTitle: 'New Announcement',
    defaultSlideLabel: 'Text',
  },
  sermon: {
    label: 'Sermon',
    contentLabel: 'Notes',
    defaultSectionTitle: 'New Sermon',
    defaultSlideLabel: 'Notes',
  },
}

export function normalizeSectionType(type) {
  if (SECTION_TYPE_META[type]) return type
  if (type === 'custom') return 'announcement'
  return 'announcement'
}

export function isKnownSectionType(type) {
  return Boolean(SECTION_TYPE_META[type])
}

export function getSectionTypeMeta(type) {
  return SECTION_TYPE_META[normalizeSectionType(type)]
}

export function getSectionTypeLabel(type) {
  return getSectionTypeMeta(type).label
}

export function getSectionContentLabel(type) {
  return getSectionTypeMeta(type).contentLabel
}

export function createTextSlide(sectionType = 'announcement', overrides = {}) {
  const meta = getSectionTypeMeta(sectionType)
  return {
    id: uuid(),
    type: overrides.type || 'text',
    label: overrides.label || meta.defaultSlideLabel,
    body: overrides.body || '',
    notes: overrides.notes || '',
    backgroundId: overrides.backgroundId ?? null,
    textStyle: overrides.textStyle || {
      size: 52,
      align: 'center',
      valign: 'center',
      color: '#ffffff',
      bold: false,
    },
    ...overrides,
  }
}

export function createMediaSlide(media, overrides = {}) {
  return {
    id: uuid(),
    type: 'media',
    label: overrides.label || media?.name || 'Media',
    body: '',
    notes: '',
    mediaId: media?.id ?? overrides.mediaId ?? null,
    backgroundId: null,
    textStyle: {
      size: 52,
      align: 'center',
      valign: 'center',
      color: '#ffffff',
      bold: false,
    },
    ...overrides,
  }
}

export function createSection(sectionType = 'announcement', index = 0, overrides = {}) {
  const meta = getSectionTypeMeta(sectionType)
  return {
    id: uuid(),
    title: overrides.title || meta.defaultSectionTitle,
    type: normalizeSectionType(sectionType),
    color: overrides.color || SECTION_COLORS[index % SECTION_COLORS.length],
    collapsed: false,
    slides: overrides.slides || [],
    backgroundId: overrides.backgroundId ?? null,
    ...overrides,
  }
}

export function isMediaSlide(slide) {
  return slide?.type === 'media' && Boolean(slide?.mediaId)
}

export function promptForSectionSetup(preferredType = null) {
  let resolvedType = preferredType ? normalizeSectionType(preferredType) : null
  if (!preferredType) {
    const typeInput = window.prompt(
      'What kind of section do you want to add? (song, announcement, sermon)',
      'announcement'
    )
    if (typeInput === null) return null
    const requestedType = typeInput.trim().toLowerCase()
    if (!isKnownSectionType(requestedType)) {
      window.alert('Please enter song, announcement, or sermon.')
      return null
    }
    resolvedType = requestedType
  }

  if (!resolvedType) return null

  const meta = getSectionTypeMeta(resolvedType)
  const suggestedTitle = meta.defaultSectionTitle
  const titleInput = window.prompt(
    `Name this ${meta.label.toLowerCase()} section:`,
    suggestedTitle
  )
  if (titleInput === null) return null

  return {
    type: resolvedType,
    title: titleInput.trim() || suggestedTitle,
  }
}
