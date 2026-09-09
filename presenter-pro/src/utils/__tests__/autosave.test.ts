import { describe, it, expect } from 'vitest';
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, nextAutosaveDelayMs } from '@/utils/autosave';

// Plan A5 slice 2. Trailing debounce with a max wait: quiet after typing stops,
// but never more than AUTOSAVE_MAX_WAIT_MS apart while someone keeps typing.

describe('nextAutosaveDelayMs', () => {
  it('waits the full debounce for a first change', () => {
    expect(nextAutosaveDelayMs({ now: 1_000, lastChangeAt: 1_000, lastWriteAt: null })).toBe(
      AUTOSAVE_DEBOUNCE_MS
    );
  });

  it('caps the wait when changes have been continuous', () => {
    // Last write 9s ago: at most 1s left of the 10s ceiling.
    const delay = nextAutosaveDelayMs({
      now: 10_000,
      lastChangeAt: 10_000,
      lastWriteAt: 1_000,
    });
    expect(delay).toBeLessThanOrEqual(1_000);
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it('writes immediately once the ceiling has passed', () => {
    expect(nextAutosaveDelayMs({ now: 12_000, lastChangeAt: 12_000, lastWriteAt: 1_000 })).toBe(0);
  });

  it('has a debounce shorter than its ceiling', () => {
    // A ceiling below the debounce would make every write immediate.
    expect(AUTOSAVE_DEBOUNCE_MS).toBeLessThan(AUTOSAVE_MAX_WAIT_MS);
  });
});
