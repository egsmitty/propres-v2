import { SECTION_COLORS } from '@/utils/backgrounds'

// ── Song slide section types ──────────────────────────────────────────────────

export const SECTION_TYPES = [
  { id: 'verse',      label: 'Verse',      abbr: 'V',  color: '#4a7cff' },
  { id: 'chorus',     label: 'Chorus',     abbr: 'C',  color: '#16a34a' },
  { id: 'bridge',     label: 'Bridge',     abbr: 'B',  color: '#9333ea' },
  { id: 'intro',      label: 'Intro',      abbr: 'I',  color: '#ea580c' },
  { id: 'outro',      label: 'Outro',      abbr: 'O',  color: '#6b7280' },
  { id: 'tag',        label: 'Tag',        abbr: 'T',  color: '#db2777' },
  { id: 'turnaround', label: 'Turnaround', abbr: 'Tu', color: '#ca8a04' },
  { id: 'blank',      label: 'Blank',      abbr: '--', color: '#374151' },
  { id: 'custom',     label: 'Custom',     abbr: '?',  color: '#0891b2' },
]

export function getSectionType(id) {
  return SECTION_TYPES.find((t) => t.id === id) || SECTION_TYPES[0]
}

export function getSectionColor(id) {
  return getSectionType(id).color
}
import { uuid } from '@/utils/uuid'
import { showDialog } from '@/utils/dialog'
import {
  DEFAULT_PLACEHOLDER_TEXT,
  DEFAULT_TEXT_BOX,
  DEFAULT_TEXT_STYLE,
  createDefaultTextBoxForSlide,
  mergeTextBox,
  mergeTextStyle,
  resolvePlaceholderText,
  syncLegacyTextFields,
} from '@/utils/textBoxes'

export {
  DEFAULT_PLACEHOLDER_TEXT,
  DEFAULT_TEXT_BOX,
  DEFAULT_TEXT_STYLE,
  mergeTextBox,
  mergeTextStyle,
  resolvePlaceholderText,
}

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
  const baseSlide = {
    id: uuid(),
    type: overrides.type || normalizeSectionType(sectionType),
    label: overrides.label || meta.defaultSlideLabel,
    body: overrides.body || '',
    placeholderText: overrides.placeholderText ?? DEFAULT_PLACEHOLDER_TEXT,
    notes: overrides.notes || '',
    backgroundId: overrides.backgroundId ?? null,
    textStyle: mergeTextStyle(overrides.textStyle),
    textBox: mergeTextBox(overrides.textBox),
    textBoxes: overrides.textBoxes,
    ...overrides,
  }

  const normalizedBoxes = Array.isArray(overrides.textBoxes) && overrides.textBoxes.length
    ? overrides.textBoxes
    : [createDefaultTextBoxForSlide({ ...baseSlide, type: normalizeSectionType(sectionType) }, {
        body: baseSlide.body,
        placeholderText: baseSlide.placeholderText,
        textStyle: baseSlide.textStyle,
        ...baseSlide.textBox,
      })]

  return syncLegacyTextFields({ ...baseSlide, type: normalizeSectionType(sectionType) }, normalizedBoxes)
}

export function createMediaSlide(media, overrides = {}) {
  return {
    id: uuid(),
    type: 'media',
    label: overrides.label || media?.name || 'Media',
    body: '',
    placeholderText: null,
    notes: '',
    mediaId: media?.id ?? overrides.mediaId ?? null,
    backgroundId: null,
    textStyle: mergeTextStyle(overrides.textStyle),
    textBox: mergeTextBox(overrides.textBox),
    textBoxes: [],
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

export async function promptForSectionSetup(preferredType = null) {
  const resolvedType = preferredType ? normalizeSectionType(preferredType) : 'announcement'
  const meta = getSectionTypeMeta(resolvedType)
  const typeLocked = Boolean(preferredType)

  const fields = []
  if (!typeLocked) {
    fields.push({
      name: 'type',
      label: 'Section Type',
      type: 'select',
      defaultValue: resolvedType,
      options: Object.keys(SECTION_TYPE_META).map((key) => ({
        value: key,
        label: SECTION_TYPE_META[key].label,
      })),
    })
  }
  fields.push({
    name: 'title',
    label: 'Section Title',
    type: 'text',
    defaultValue: meta.defaultSectionTitle,
    autoFocus: typeLocked,
  })

  const result = await showDialog({
    title: typeLocked ? `New ${meta.label} Section` : 'New Section',
    fields,
    actions: [
      { label: 'Cancel', value: null, cancel: true },
      { label: 'Create', value: 'confirm', primary: true },
    ],
  })

  if (!result || result.action !== 'confirm') return null

  const chosenType = typeLocked ? resolvedType : normalizeSectionType(result.values.type)
  const chosenMeta = getSectionTypeMeta(chosenType)
  const title = (result.values.title || '').trim() || chosenMeta.defaultSectionTitle

  return { type: chosenType, title }
}
