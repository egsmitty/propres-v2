import { createSong, getSongs, updateSong } from '@/utils/ipc';
import { buildSongRecordFromBuiltInHymn, getBuiltInHymns } from '@/utils/builtInHymns';
import { hymnTextFingerprint } from '@/utils/builtInHymnFingerprint';

// Keeps the built-in public-domain hymns present in the song library.
//
// A row belongs to this seeder ONLY if its built_in_key matches a hymn id.
// Title or tag coincidence is not a match: a user's own arrangement of
// "Amazing Grace" is theirs, whatever it is called or tagged. Earlier versions
// matched by title + tag and deleted "duplicates", which could overwrite or
// delete a user's song on every launch (phase7 #14). Rows written by those
// versions before built_in_key existed are adopted once by migration 3, not
// here. This module never deletes anything.
//
// Refresh only if untouched (plan A3b): every row this seeder writes is
// stamped with built_in_revision = fingerprint of the TEXT it wrote. A row is
// refreshed only while its current text still matches that stamp — the moment
// a user edits a built-in hymn it is theirs, forever. Rows without a stamp
// (written before A3b) are adopted once if their text already equals the
// source; otherwise their provenance is unknowable and they are left alone.

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

    const sourceRevision = hymnTextFingerprint(payload);

    if (existing) {
      if (shouldRefresh(existing, sourceRevision)) {
        await updateSong(existing.id, {
          ...payload,
          ccli: existing.ccli || '',
          builtInRevision: sourceRevision,
        });
      }
      continue;
    }

    await createSong({ ...payload, builtInRevision: sourceRevision });
  }
}

/**
 * The decision matrix for a row that already carries the hymn's key.
 * @returns true only when the row is provably untouched AND the source changed.
 */
function shouldRefresh(existing, sourceRevision) {
  const rowRevision = hymnTextFingerprint(existing);
  const stamped = existing.builtInRevision ?? null;

  if (stamped === null) {
    // Pre-A3b row: adopt (and stamp) only if it is byte-for-byte our text.
    return rowRevision === sourceRevision;
  }
  if (rowRevision !== stamped) return false; // user edited — never touch
  return sourceRevision !== stamped; // untouched; refresh only if source moved
}
