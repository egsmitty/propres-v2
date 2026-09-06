/**
 * Text fingerprint of a built-in hymn record (plan A3b).
 *
 * The seeder stamps `built_in_revision` with this value when it writes a hymn,
 * and on later launches refreshes the row only if the row's current text still
 * produces the same fingerprint — i.e. the user never edited it.
 *
 * Only TEXT participates: title, artist, each group's type + label, and each
 * slide's trimmed body. Group/slide ids are regenerated on every seeder call
 * and styling is the user's to change, so neither may influence the result.
 *
 * FNV-1a 32-bit — deterministic, dependency-free, and adequate for detecting
 * "did this text change"; it is not a security primitive.
 */

interface SlideText {
  body?: unknown;
}

interface GroupText {
  type?: unknown;
  label?: unknown;
  slides?: unknown;
}

export interface HymnTextRecord {
  title?: unknown;
  artist?: unknown;
  songGroups?: unknown;
}

const SEPARATOR = ''; // unit separator — cannot appear in lyric text

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseGroups(songGroups: unknown): GroupText[] {
  if (Array.isArray(songGroups)) return songGroups as GroupText[];
  if (typeof songGroups !== 'string' || songGroups === '') return [];
  try {
    const parsed: unknown = JSON.parse(songGroups);
    return Array.isArray(parsed) ? (parsed as GroupText[]) : [];
  } catch {
    // Unparseable groups are treated as "no groups"; the row will simply never
    // match the seeder's text, which is the safe outcome (it is left alone).
    return [];
  }
}

/** The canonical text the fingerprint is computed over. Exported for tests only. */
export function canonicalHymnText(record: HymnTextRecord): string {
  const parts: string[] = [asText(record.title), asText(record.artist)];
  for (const group of parseGroups(record.songGroups)) {
    parts.push(asText(group?.type), asText(group?.label));
    const slides = Array.isArray(group?.slides) ? (group.slides as SlideText[]) : [];
    for (const slide of slides) parts.push(asText(slide?.body));
  }
  return parts.join(SEPARATOR);
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in uint32 via Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function hymnTextFingerprint(record: HymnTextRecord): string {
  return fnv1a32(canonicalHymnText(record));
}
