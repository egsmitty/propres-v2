import { createSong, getSongs, updateSong } from '@/utils/ipc';
import { buildSongRecordFromBuiltInHymn, getBuiltInHymns } from '@/utils/builtInHymns';

// Keeps the built-in public-domain hymns present in the song library.
//
// A row belongs to this seeder ONLY if its built_in_key matches a hymn id.
// Title or tag coincidence is not a match: a user's own arrangement of
// "Amazing Grace" is theirs, whatever it is called or tagged. Earlier versions
// matched by title + tag and deleted "duplicates", which could overwrite or
// delete a user's song on every launch (phase7 #14). Rows written by those
// versions before built_in_key existed are adopted once by migration 3, not
// here. This module never deletes anything.

let seedPromise = null;

export async function ensureBuiltInSongsSeeded() {
  if (seedPromise) return seedPromise;

  seedPromise = ensureBuiltInSongsSeededInner().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

async function ensureBuiltInSongsSeededInner() {
  const hymnSources = getBuiltInHymns();
  if (!hymnSources.length) return;

  const existingResult = await getSongs();
  if (!existingResult?.success) return;

  const songs = existingResult.data || [];
  for (const hymn of hymnSources) {
    const payload = buildSongRecordFromBuiltInHymn(hymn);
    const existing = songs.find((song) => song?.builtInKey === hymn.id) || null;

    if (existing) {
      await updateSong(existing.id, {
        ...payload,
        ccli: existing.ccli || '',
      });
      continue;
    }

    await createSong(payload);
  }
}
