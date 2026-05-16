import { createSong, deleteSong, getSongs, updateSong } from '@/utils/ipc'
import { buildSongRecordFromBuiltInHymn, getBuiltInHymns } from '@/utils/builtInHymns'

let seedPromise = null

function parseTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags
  if (typeof rawTags !== 'string') return []
  try {
    const parsed = JSON.parse(rawTags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isBuiltInCandidate(song, hymn) {
  if (!song) return false
  if (song.builtInKey === hymn.id) return true
  if (song.title !== hymn.title) return false
  const tags = parseTags(song.tags)
  return tags.includes('built-in') || tags.includes('hymn')
}

export async function ensureBuiltInSongsSeeded() {
  if (seedPromise) return seedPromise

  seedPromise = ensureBuiltInSongsSeededInner().finally(() => {
    seedPromise = null
  })
  return seedPromise
}

async function ensureBuiltInSongsSeededInner() {
  const hymnSources = getBuiltInHymns()
  if (!hymnSources.length) return

  const existingResult = await getSongs()
  if (!existingResult?.success) return

  let songs = existingResult.data || []
  for (const hymn of hymnSources) {
    const payload = buildSongRecordFromBuiltInHymn(hymn)
    const matches = songs.filter((song) => isBuiltInCandidate(song, hymn))
    const existing = matches.find((song) => song.builtInKey === hymn.id) || matches[0] || null

    if (existing) {
      await updateSong(existing.id, {
        ...payload,
        ccli: existing.ccli || '',
      })
      const duplicates = matches.filter((song) => song.id !== existing.id)
      for (const duplicate of duplicates) {
        await deleteSong(duplicate.id)
      }
      songs = songs
        .filter((song) => song.id === existing.id || !matches.some((match) => match.id === song.id))
        .map((song) => (song.id === existing.id ? { ...song, ...payload } : song))
      continue
    }

    const created = await createSong(payload)
    if (created?.success && created.data) {
      songs = [...songs, created.data]
    }
  }
}
