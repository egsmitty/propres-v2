import { uuid } from '@/utils/uuid'
import { createTextSlide, getSectionType, getSectionTypeMeta } from '@/utils/sectionTypes'

const SONG_GROUP_LABEL_RE = /^\[?(verse|chorus|bridge|intro|outro|pre-chorus|tag|turnaround|turn|t\.a\.|blank|custom)(?:\s+(\d+))?\]?$/i

function stripBrackets(value = '') {
  return String(value).replace(/^\[|\]$/g, '').trim()
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
  if (lower === 'prechorus') return 'chorus'
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
  try {
    const rawOrder = song?.songOrder ?? song?.song_order
    const parsed = typeof rawOrder === 'string' ? JSON.parse(rawOrder) : rawOrder
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

export function normalizeSongArrangement(order = [], groups = []) {
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

  if (!arrangement.length) {
    return groupIds
  }

  for (const groupId of groupIds) {
    if (!arrangement.includes(groupId)) {
      arrangement.push(groupId)
    }
  }

  return arrangement
}

export function getSongGroupsAndArrangement(song) {
  const slides = parseRawSongSlides(song)
  const groups = normalizeSongGroupsFromSlides(slides)
  const arrangement = normalizeSongArrangement(parseRawSongArrangement(song), groups)
  return { groups, arrangement }
}

export function flattenSongGroupsToSlides(groups = [], arrangement = [], options = {}) {
  const {
    regenerateSlideIds = false,
    regenerateGroupIds = false,
    songId = null,
  } = options

  const normalizedGroups = groups.map((group) => ({
    ...group,
    id: regenerateGroupIds ? uuid() : (group.id || uuid()),
    slides: (group.slides || []).map((slide) => ({
      id: regenerateSlideIds ? uuid() : (slide.id || uuid()),
      body: slide.body || '',
    })),
  }))
  const normalizedArrangement = normalizeSongArrangement(arrangement, normalizedGroups)
  const groupLookup = new Map(normalizedGroups.map((group) => [group.id, group]))
  const slides = []

  normalizedArrangement.forEach((groupId) => {
    const group = groupLookup.get(groupId)
    if (!group) return

    group.slides.forEach((slide) => {
      slides.push(
        createTextSlide('song', {
          id: slide.id,
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
