import hymnsSource from '../../shared/hymns.json'
import { flattenSongGroupsToSlides, createSongSectionGroup, splitTextIntoSlidesByLineCount } from '@/utils/songSections'
import { uuid } from '@/utils/uuid'

export function getBuiltInHymns() {
  return Array.isArray(hymnsSource?.hymns) ? hymnsSource.hymns : []
}

export function findBuiltInHymnById(id) {
  return getBuiltInHymns().find((hymn) => hymn.id === id) || null
}

export function buildSongGroupsFromBuiltInHymn(hymn) {
  return (hymn?.sections || []).map((section) => (
    createSongSectionGroup(
      section.type || 'verse',
      section.name || '',
      splitTextIntoSlidesByLineCount(section.lyrics, 2).map((body) => ({ id: uuid(), body })),
      uuid()
    )
  ))
}

export function buildSongRecordFromBuiltInHymn(hymn) {
  const groups = buildSongGroupsFromBuiltInHymn(hymn)
  const arrangement = groups.map((group) => group.id)
  const flattened = flattenSongGroupsToSlides(groups, arrangement)
  const tags = Array.from(new Set(['hymn', 'public-domain', 'built-in']))

  return {
    title: hymn.title,
    artist: hymn.author || '',
    tags: JSON.stringify(tags),
    builtInKey: hymn.id,
    songGroups: JSON.stringify(flattened.groups),
    songOrder: JSON.stringify(flattened.arrangement),
    slides: JSON.stringify(flattened.slides),
  }
}
