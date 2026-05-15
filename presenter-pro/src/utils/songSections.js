import { uuid } from '@/utils/uuid'
import { createTextSlide, getSectionType, getSectionTypeMeta } from '@/utils/sectionTypes'

const SONG_GROUP_LABEL_RE = /^\[?(verse|chorus|bridge|intro|outro|pre-chorus|tag|turnaround|turn|t\.a\.|blank|custom)(?:\s+(\d+))?\]?$/i

function stripBrackets(value = '') {
  return String(value).replace(/^\[|\]$/g, '').trim()
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function toTitleCase(value = '') {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function resolveSongSectionType(raw = '') {
  const lower = String(raw).toLowerCase().replace(/[\[\].-]/g, '').replace(/\s+/g, '')
  if (lower === 'prechorus') return 'pre-chorus'
  if (lower === 'turn' || lower === 'ta' || lower === 'turnaround') return 'turnaround'
  return lower.replace(/\d+$/, '')
}

export function makeSongGroupLabel(type, explicitLabel = '', number = '') {
  if (explicitLabel) return stripBrackets(explicitLabel)

  const sectionType = getSectionType(type)
  const base = sectionType?.label || toTitleCase(type)
  return number ? `${base} ${number}` : base
}

export function createSongSectionGroup(type = 'verse', label = '', slides = [], id = uuid()) {
  return {
    id,
    type,
    label: makeSongGroupLabel(type, label),
    slides: slides.map((slide) => ({
      id: slide.id || uuid(),
      body: slide.body || '',
    })),
  }
}

export function splitTextIntoSlidesByLineCount(text = '', maxLinesPerSlide = 2) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return ['']

  const slides = []
  for (let index = 0; index < lines.length; index += maxLinesPerSlide) {
    slides.push(lines.slice(index, index + maxLinesPerSlide).join('\n'))
  }

  return slides
}

export function parseSongGroupsFromLyrics(text = '') {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const groups = []
  let currentGroup = null
  let currentSlideLines = []

  function ensureGroup(type = 'verse', label = 'Verse 1') {
    if (currentGroup) return currentGroup
    currentGroup = createSongSectionGroup(type, label)
    groups.push(currentGroup)
    return currentGroup
  }

  function flushSlide() {
    if (!currentGroup || currentSlideLines.length === 0) return
    currentGroup.slides.push({
      id: uuid(),
      body: currentSlideLines.join('\n').trim(),
    })
    currentSlideLines = []
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    const labelMatch = trimmed.match(SONG_GROUP_LABEL_RE)

    if (labelMatch) {
      flushSlide()
      const [, rawType, number = ''] = labelMatch
      const type = resolveSongSectionType(rawType)
      currentGroup = createSongSectionGroup(type, makeSongGroupLabel(type, trimmed, number))
      groups.push(currentGroup)
      continue
    }

    if (!trimmed) {
      flushSlide()
      continue
    }

    if (!currentGroup) {
      currentGroup = createSongSectionGroup('verse', 'Verse 1')
      groups.push(currentGroup)
    }

    currentSlideLines.push(trimmed)
  }

  flushSlide()
  return groups.filter((group) => group.slides.length > 0)
}

export function parseRawSongSlides(song) {
  try {
    const rawSlides = song?.slides
    const parsed = typeof rawSlides === 'string' ? JSON.parse(rawSlides) : rawSlides
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseRawSongArrangement(song) {
  return toArray(song?.songOrder ?? song?.song_order)
}

export function parseRawSongGroups(song) {
  return toArray(song?.songGroups ?? song?.song_groups)
}

export function normalizeSongGroupsFromSlides(slides = []) {
  const groups = []
  let previousGroup = null

  for (const slide of slides) {
    const type = slide?.type || 'verse'
    const label = slide?.label || getSectionType(type)?.label || getSectionTypeMeta('song').defaultSlideLabel
    const explicitGroupId = slide?.groupId || slide?.sectionGroupId || null

    const shouldAppend =
      previousGroup &&
      (
        (explicitGroupId && previousGroup.id === explicitGroupId) ||
        (!explicitGroupId && previousGroup.type === type && previousGroup.label === label)
      )

    if (shouldAppend) {
      previousGroup.slides.push({
        id: slide.id || uuid(),
        body: slide.body || '',
      })
      continue
    }

    previousGroup = createSongSectionGroup(
      type,
      label,
      [{ id: slide.id || uuid(), body: slide.body || '' }],
      explicitGroupId || uuid()
    )
    groups.push(previousGroup)
  }

  return groups
}

function normalizeSectionSongOrder(section) {
  return toArray(section?.songOrder)
}

function normalizeSectionSongGroups(section) {
  const rawGroups = toArray(section?.songGroups)
  return rawGroups.map((group) =>
    createSongSectionGroup(group?.type || 'verse', group?.label || '', group?.slides || [], group?.id || uuid())
  )
}

function getSlideGroupId(slide) {
  return slide?.groupId || slide?.sectionGroupId || null
}

function getSlideGroupSignature(slide) {
  return `${resolveSongSectionType(slide?.type || 'verse')}::${String(slide?.label || '').trim()}`
}

export function normalizeSongArrangement(order = [], groups = [], options = {}) {
  const { fallbackToAllGroups = true } = options
  const groupIds = groups.map((group) => group.id)
  const knownGroupIds = new Set(groupIds)
  const slideToGroup = new Map()
  groups.forEach((group) => {
    group.slides.forEach((slide) => {
      slideToGroup.set(slide.id, group.id)
    })
  })

  const arrangement = []
  for (const entry of Array.isArray(order) ? order : []) {
    const groupId = knownGroupIds.has(entry) ? entry : slideToGroup.get(entry)
    if (!groupId) continue
    arrangement.push(groupId)
  }

  if (!arrangement.length && fallbackToAllGroups) {
    return groupIds
  }

  return arrangement
}

export function getSongGroupsAndArrangement(song) {
  const persistedGroups = parseRawSongGroups(song).map((group) =>
    createSongSectionGroup(group?.type || 'verse', group?.label || '', group?.slides || [], group?.id || uuid())
  )
  const storedArrangement = parseRawSongArrangement(song)
  const hasStoredArrangement =
    Array.isArray(song?.songOrder) ||
    typeof song?.songOrder === 'string' ||
    Array.isArray(song?.song_order) ||
    typeof song?.song_order === 'string'

  if (persistedGroups.length) {
    const knownGroupIds = new Set(persistedGroups.map((group) => group.id))
    return {
      groups: persistedGroups,
      arrangement: hasStoredArrangement
        ? storedArrangement.filter((groupId) => knownGroupIds.has(groupId))
        : normalizeSongArrangement(storedArrangement, persistedGroups),
    }
  }

  const slides = parseRawSongSlides(song)
  const groups = normalizeSongGroupsFromSlides(slides)
  const arrangement = normalizeSongArrangement(storedArrangement, groups)
  return { groups, arrangement }
}

export function getSongSectionGroupsAndArrangement(section) {
  const persistedGroups = normalizeSectionSongGroups(section)
  const storedArrangement = normalizeSectionSongOrder(section)
  const hasStoredArrangement =
    Array.isArray(section?.songOrder) ||
    typeof section?.songOrder === 'string'

  if (persistedGroups.length) {
    const knownGroupIds = new Set(persistedGroups.map((group) => group.id))
    const arrangement = hasStoredArrangement
      ? storedArrangement.filter((groupId) => knownGroupIds.has(groupId))
      : normalizeSongArrangement(storedArrangement, persistedGroups)

    return {
      groups: persistedGroups,
      arrangement,
    }
  }

  const slides = Array.isArray(section?.slides) ? section.slides : []
  const groups = []
  const groupLookup = new Map()
  const signatureLookup = new Map()
  const arrangement = []
  const occurrences = []

  let currentOccurrence = null

  slides.forEach((slide) => {
    const explicitGroupId = getSlideGroupId(slide)
    const signature = getSlideGroupSignature(slide)

    if (
      !currentOccurrence ||
      currentOccurrence.explicitGroupId !== explicitGroupId ||
      currentOccurrence.signature !== signature
    ) {
      currentOccurrence = {
        explicitGroupId,
        signature,
        type: resolveSongSectionType(slide?.type || 'verse'),
        label: slide?.label || makeSongGroupLabel(slide?.type || 'verse'),
        slides: [],
      }
      occurrences.push(currentOccurrence)
    }

    currentOccurrence.slides.push({
      id: slide?.id || uuid(),
      body: slide?.body || '',
    })
  })

  occurrences.forEach((occurrence, index) => {
    let groupId = occurrence.explicitGroupId || null
    if (!groupId) {
      const storedId = storedArrangement[index]
      if (storedId) groupId = storedId
    }
    if (!groupId) {
      groupId = signatureLookup.get(occurrence.signature) || null
    }
    if (!groupId) {
      groupId = uuid()
    }

    if (!groupLookup.has(groupId)) {
      const group = createSongSectionGroup(
        occurrence.type,
        occurrence.label,
        occurrence.slides,
        groupId
      )
      groupLookup.set(groupId, group)
      groups.push(group)
      if (!signatureLookup.has(occurrence.signature)) {
        signatureLookup.set(occurrence.signature, groupId)
      }
    }

    arrangement.push(groupId)
  })

  return {
    groups,
    arrangement: normalizeSongArrangement(arrangement, groups),
  }
}

export function flattenSongGroupsToSlides(groups = [], arrangement = [], options = {}) {
  const {
    regenerateSlideIds = false,
    regenerateGroupIds = false,
    songId = null,
    preserveEmptyArrangement = false,
  } = options

  const normalizedGroups = groups.map((group) => ({
    ...group,
    id: regenerateGroupIds ? uuid() : (group.id || uuid()),
    slides: (group.slides || []).map((slide) => ({
      id: regenerateSlideIds ? uuid() : (slide.id || uuid()),
      body: slide.body || '',
    })),
  }))
  const normalizedArrangement = normalizeSongArrangement(arrangement, normalizedGroups, {
    fallbackToAllGroups: !preserveEmptyArrangement,
  })
  const groupLookup = new Map(normalizedGroups.map((group) => [group.id, group]))
  const slides = []

  normalizedArrangement.forEach((groupId) => {
    const group = groupLookup.get(groupId)
    if (!group) return

    group.slides.forEach((slide) => {
      slides.push(
        createTextSlide('song', {
          // Flattened arrangement slides must stay unique even when a group repeats.
          id: uuid(),
          type: group.type,
          label: group.label,
          body: slide.body,
          groupId: group.id,
          songId: songId ?? undefined,
        })
      )
    })
  })

  return {
    groups: normalizedGroups,
    arrangement: normalizedArrangement,
    slides,
  }
}

export function getOrderedSongSlides(song, options = {}) {
  const { groups, arrangement } = getSongGroupsAndArrangement(song)
  return flattenSongGroupsToSlides(groups, arrangement, options).slides
}
