import { flattenSongGroupsToSlides, parseSongGroupsFromLyrics } from '@/utils/songSections'

export function parseSongGroups(text) {
  return parseSongGroupsFromLyrics(text)
}

export function parseSlides(text) {
  return flattenSongGroupsToSlides(parseSongGroupsFromLyrics(text)).slides
}
