import { describe, it, expect } from 'vitest';
import { shouldApplyRefresh } from '../presentationWindows';

// Plan L4 (audit LIVE-A3). `output:refreshSlide` pushed whatever slide it was
// given to the projector. The renderer's session sync reads the live slide
// id, awaits an IPC round trip, then refreshes that slide — so a clicker press
// landing in between (or an edit racing an advance) could send the PREVIOUS
// slide back over the one that just went live: C → B → C on the projector.
// Main now applies a refresh only to the slide that is actually live.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

describe('shouldApplyRefresh', () => {
  it('applies a refresh to the slide that is live', () => {
    expect(shouldApplyRefresh({ id: 'c' }, { id: 'c' })).toBe(true);
  });

  it('ignores a refresh for a slide that is no longer live', () => {
    expect(shouldApplyRefresh({ id: 'c' }, { id: 'b' })).toBe(false);
  });

  it('applies a refresh when nothing is live yet', () => {
    expect(shouldApplyRefresh(null, { id: 'a' })).toBe(true);
  });

  it('ignores a refresh that carries no slide', () => {
    expect(shouldApplyRefresh({ id: 'c' }, null)).toBe(false);
  });
});
