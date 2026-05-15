import { createSong, getSongs, updateSong } from '@/utils/ipc'
import { buildSongRecordFromBuiltInHymn, getBuiltInHymns } from '@/utils/builtInHymns'

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
  const hymnSources = getBuiltInHymns()
  if (!hymnSources.length) return

  const existingResult = await getSongs()
  if (!existingResult?.success) return

  let songs = existingResult.data || []
  for (const hymn of hymnSources) {
    const payload = buildSongRecordFromBuiltInHymn(hymn)
    const existing = songs.find((song) => isBuiltInCandidate(song, hymn)) || null

    if (existing) {
      await updateSong(existing.id, {
        ...payload,
        ccli: existing.ccli || '',
      })
      songs = songs.map((song) => (song.id === existing.id ? { ...song, ...payload } : song))
      continue
    }

    const created = await createSong(payload)
    if (created?.success && created.data) {
      songs = [...songs, created.data]
    }
  }
}
