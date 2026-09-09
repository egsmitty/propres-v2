/**
 * Autosave timing — pure (plan A5 slice 2). No I/O, no store; the wiring lives
 * in `autosaveSync.ts`.
 *
 * A trailing debounce with a ceiling: quiet once typing stops, but never more
 * than `AUTOSAVE_MAX_WAIT_MS` between writes while someone keeps typing, so a
 * long uninterrupted stretch of work cannot sit unwritten.
 *
 * Two seconds is what Google Docs and Keynote have taught people to expect.
 *
 * This is a fresh implementation rather than an import of A2's
 * `nextWriteDelayMs`: slice 3 deletes that module's writer, and live code must
 * not depend on something being retired.
 */

/** Quiet period after the last change before a write. */
export const AUTOSAVE_DEBOUNCE_MS = 2_000;

/** Longest gap between writes while changes keep arriving. */
export const AUTOSAVE_MAX_WAIT_MS = 10_000;

export interface AutosaveTiming {
  now: number;
  lastChangeAt: number;
  /** null when nothing has been written for this document yet. */
  lastWriteAt: number | null;
}

/** Milliseconds to wait before the next write. Never negative. */
export function nextAutosaveDelayMs({ now, lastChangeAt, lastWriteAt }: AutosaveTiming): number {
  const debounceDelay = Math.max(0, lastChangeAt + AUTOSAVE_DEBOUNCE_MS - now);
  if (lastWriteAt === null) return debounceDelay;

  const ceilingDelay = Math.max(0, lastWriteAt + AUTOSAVE_MAX_WAIT_MS - now);
  return Math.min(debounceDelay, ceilingDelay);
}
