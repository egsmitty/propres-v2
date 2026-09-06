/**
 * Crash-recovery journal — pure policy.
 *
 * While a presentation has unsaved edits, the app keeps a journal snapshot in
 * SQLite (`presentation_journal`, migration 2). After a crash, the next launch
 * offers to recover it. This module decides *which* journals may be offered
 * and *when* the next journal write should happen. No I/O, no store — the
 * wiring lives in `recoveryJournalSync.ts`.
 */

export interface JournalRow {
  presentation_id: number;
  saved_at: number;
  /** `presentations.updated_at` the snapshot was based on; null if unknown. */
  base_updated_at: number | null;
  /** JSON of the in-memory presentation at journal time. */
  snapshot: string;
}

export interface PresentationRow {
  id: number;
  title: string;
  updated_at: number;
}

export type StaleReason = 'presentation-missing' | 'saved-since';

export interface RecoverySelection {
  recoverable: Array<{ journal: JournalRow; presentation: PresentationRow }>;
  stale: Array<{ journal: JournalRow; reason: StaleReason }>;
}

/** Trailing debounce after the last change. */
export const JOURNAL_DEBOUNCE_MS = 2_000;
/** Upper bound between writes while changes keep coming, so continuous editing still journals. */
export const JOURNAL_MAX_WAIT_MS = 10_000;

/**
 * Partition journals into those that may be offered for recovery and those
 * that are stale, with a reason for every rejection. Input order is preserved
 * in both partitions.
 *
 * A journal is stale when its presentation no longer exists, or when the
 * presentation's `updated_at` no longer matches the journal's base — the user
 * saved (or the row otherwise changed) after the snapshot was taken, so the
 * snapshot would overwrite newer work.
 */
export function selectRecoverable(
  journals: readonly JournalRow[],
  presentations: readonly PresentationRow[]
): RecoverySelection {
  const byId = new Map(presentations.map((p) => [p.id, p]));
  const selection: RecoverySelection = { recoverable: [], stale: [] };
  for (const journal of journals) {
    const presentation = byId.get(journal.presentation_id);
    if (!presentation) {
      selection.stale.push({ journal, reason: 'presentation-missing' });
    } else if (journal.base_updated_at !== presentation.updated_at) {
      selection.stale.push({ journal, reason: 'saved-since' });
    } else {
      selection.recoverable.push({ journal, presentation });
    }
  }
  return selection;
}

/**
 * Milliseconds until the next journal write: the debounce measured from the
 * last change, capped so no more than `JOURNAL_MAX_WAIT_MS` passes since the
 * last write while edits continue. Zero means write now.
 */
export function nextWriteDelayMs(input: {
  now: number;
  lastChangeAt: number;
  lastWriteAt: number | null;
}): number {
  const { now, lastChangeAt, lastWriteAt } = input;
  const debounceRemaining = Math.max(0, lastChangeAt + JOURNAL_DEBOUNCE_MS - now);
  if (lastWriteAt === null) return debounceRemaining;
  const maxWaitRemaining = Math.max(0, lastWriteAt + JOURNAL_MAX_WAIT_MS - now);
  return Math.min(debounceRemaining, maxWaitRemaining);
}
