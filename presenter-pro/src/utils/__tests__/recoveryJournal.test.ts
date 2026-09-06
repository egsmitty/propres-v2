import { describe, it, expect } from 'vitest';
import {
  selectRecoverable,
  nextWriteDelayMs,
  JOURNAL_DEBOUNCE_MS,
  JOURNAL_MAX_WAIT_MS,
  type JournalRow,
  type PresentationRow,
} from '@/utils/recoveryJournal';

// Pure policy for the crash-recovery journal. Which journals may be offered,
// and when the next journal write should happen. No I/O, no store.

const journal = (presentation_id: number, base_updated_at: number | null): JournalRow => ({
  presentation_id,
  saved_at: 1_000,
  base_updated_at,
  snapshot: JSON.stringify({ id: presentation_id }),
});
const presentation = (id: number, updated_at: number): PresentationRow => ({
  id,
  title: `Pres ${id}`,
  updated_at,
});

describe('selectRecoverable', () => {
  it('marks a journal stale when its presentation no longer exists', () => {
    const j = journal(7, 500);
    expect(selectRecoverable([j], [])).toEqual({
      recoverable: [],
      stale: [{ journal: j, reason: 'presentation-missing' }],
    });
  });

  it('marks a journal stale when the presentation was saved after the snapshot', () => {
    const j = journal(7, 500);
    const p = presentation(7, 900);
    expect(selectRecoverable([j], [p])).toEqual({
      recoverable: [],
      stale: [{ journal: j, reason: 'saved-since' }],
    });
  });

  it('offers a journal whose base matches the presentation exactly', () => {
    const j = journal(7, 500);
    const p = presentation(7, 500);
    expect(selectRecoverable([j], [p])).toEqual({
      recoverable: [{ journal: j, presentation: p }],
      stale: [],
    });
  });

  it('partitions a mixed set exactly, preserving input order', () => {
    const ok = journal(1, 100);
    const missing = journal(2, 100);
    const saved = journal(3, 100);
    const ok2 = journal(4, 250);
    const result = selectRecoverable(
      [ok, missing, saved, ok2],
      [presentation(1, 100), presentation(3, 999), presentation(4, 250)]
    );
    // Both arrays, whole, in order — not "contains".
    expect(result.recoverable).toEqual([
      { journal: ok, presentation: presentation(1, 100) },
      { journal: ok2, presentation: presentation(4, 250) },
    ]);
    expect(result.stale).toEqual([
      { journal: missing, reason: 'presentation-missing' },
      { journal: saved, reason: 'saved-since' },
    ]);
  });
});

describe('nextWriteDelayMs', () => {
  it('waits the full debounce after the first change when nothing was ever written', () => {
    expect(nextWriteDelayMs({ now: 10_000, lastChangeAt: 10_000, lastWriteAt: null })).toBe(
      JOURNAL_DEBOUNCE_MS
    );
  });

  it('caps the wait so continuous editing still journals within the max wait', () => {
    // Last write 9s ago: the debounce would wait 2s, but the max wait allows only 1s more.
    expect(nextWriteDelayMs({ now: 19_000, lastChangeAt: 19_000, lastWriteAt: 10_000 })).toBe(
      JOURNAL_MAX_WAIT_MS - 9_000
    );
  });

  it('writes immediately once the max wait has elapsed', () => {
    expect(nextWriteDelayMs({ now: 25_000, lastChangeAt: 25_000, lastWriteAt: 10_000 })).toBe(0);
  });
});
