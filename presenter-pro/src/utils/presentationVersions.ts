/**
 * Restore-point policy — pure (plan A5). No I/O, no store; the wiring lives in
 * `presentationVersionsSync.ts`.
 *
 * Everything here exists to answer one question: **has this document changed
 * since the last deliberate save?** Under autosave that question stops being
 * "is there anything unwritten" and becomes "does the live row differ from the
 * newest version", so it needs a definition precise enough to survive a round
 * trip through SQLite.
 */

/**
 * The content columns that can actually differ — the definition of "changed".
 *
 * `updatePresentation` writes six columns, but `default_background_id` is not
 * one of these: `normalizePresentation` hard-nulls both of its spellings on
 * every path (`backgrounds.js`), so after normalization it is a constant and
 * can never register a difference. Including it would be dead weight that reads
 * as meaningful. `id`, `created_at` and `updated_at` are excluded too —
 * `openPresentationInEditor` calls `touchPresentation` before loading, so
 * `updated_at` differs on literally every open.
 */
export const CONTENT_FIELDS = [
  'title',
  'sections',
  'aspectRatio',
  'customAspectWidth',
  'customAspectHeight',
] as const;

/** snake_case column names, as SQLite returns them, per content field. */
const SNAKE_CASE_ALIASES: Record<(typeof CONTENT_FIELDS)[number], string> = {
  title: 'title',
  sections: 'sections',
  aspectRatio: 'aspect_ratio',
  customAspectWidth: 'custom_aspect_width',
  customAspectHeight: 'custom_aspect_height',
};

/**
 * Presentation ids that are never versioned and never autosaved. Every entry
 * REQUIRES a justifying comment and must be reported. Do not add entries to
 * make something pass.
 *
 * Lives in this (pure) module so `autosaveSync` and `presentationVersionsSync`
 * can both read it without importing each other.
 */
export const VERSION_EXEMPT_PRESENTATION_IDS: ReadonlyArray<number> = [];

type Fields = Record<string, unknown>;

function read(source: Fields, field: (typeof CONTENT_FIELDS)[number]): unknown {
  const camel = source[field];
  if (camel !== undefined) return camel;
  const snake = source[SNAKE_CASE_ALIASES[field]];
  return snake === undefined ? null : snake;
}

/**
 * Stable JSON of the content fields, in `CONTENT_FIELDS` order.
 *
 * Only valid on a `normalizePresentation`-normalized presentation, and it must
 * be computed on BOTH sides of every comparison — a DB row and its in-memory
 * twin produce the same key, which is what makes the round trip lossless.
 */
export function presentationContentKey(presentation: unknown): string {
  const source = (presentation ?? {}) as Fields;
  const content: Fields = {};
  for (const field of CONTENT_FIELDS) {
    content[field] = read(source, field);
  }
  return JSON.stringify(content);
}

/**
 * True when the live document differs from the newest version's snapshot.
 *
 * `versionSnapshot` is the whole stored presentation JSON, NOT a content key.
 * It is parsed and **never re-normalized**: the snapshot was stored already
 * normalized, and running `normalizePresentation` over it again would re-mint
 * uuids for id-less slides and text boxes (`textBoxes.js`) and manufacture a
 * difference that is not there.
 *
 * No snapshot means nothing to differ from, so an absent version never marks a
 * document dirty. Neither does an unreadable one — reporting a document dirty
 * because its restore point is corrupt would start autosaving over it.
 */
export function hasDiverged(presentation: unknown, versionSnapshot: string | null): boolean {
  if (!versionSnapshot) return false;
  let stored: unknown;
  try {
    stored = JSON.parse(versionSnapshot);
  } catch {
    return false;
  }
  if (!stored || typeof stored !== 'object') return false;
  return presentationContentKey(presentation) !== presentationContentKey(stored);
}
