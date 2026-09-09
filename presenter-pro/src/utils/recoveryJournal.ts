/**
 * Crash-recovery journal — pure policy.
 *
 * While a presentation has unsaved edits, the app keeps a journal snapshot in
 * SQLite (`presentation_journal`, migration 2). After a crash, the next launch
 * offers to recover it. This module decides *which* journals may be offered
 * be offered. No I/O, no store — the wiring lives in `recoveryJournalSync.ts`.
 *
 * NOTHING WRITES JOURNALS ANY MORE (plan A5 slice 3). Autosave puts edits in
 * the real record within seconds, which makes a shadow copy redundant — and
 * actively broken: every autosave sets `presentations.updated_at`, so a journal
 * row's `base_updated_at` never matches again and `selectRecoverable` would
 * call every row stale before it was ever read. What remains here drains rows
 * written by a pre-autosave build; it can go once no profile has any.
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
