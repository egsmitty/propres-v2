import { describe, it, expect } from 'vitest';
import { shouldStopPresentingOnEscape } from '@/utils/escapeKey';

// Plan L1 (audit LIVE-A11 / CMD-B2). Escape used to stop a live presentation
// even when the key was meant for a dialog, a menu or an overlay — closing
// Output Settings or the shortcuts sheet also took the projector down. Escape
// now stops presenting only when nothing else consumed it.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

describe('shouldStopPresentingOnEscape', () => {
  it('stops a live presentation on an Escape nothing else handled', () => {
    expect(shouldStopPresentingOnEscape({ key: 'Escape', defaultPrevented: false }, true)).toBe(
      true
    );
  });

  it('leaves the presentation running when an overlay already consumed Escape', () => {
    expect(shouldStopPresentingOnEscape({ key: 'Escape', defaultPrevented: true }, true)).toBe(
      false
    );
  });

  it('does nothing when not presenting', () => {
    expect(shouldStopPresentingOnEscape({ key: 'Escape', defaultPrevented: false }, false)).toBe(
      false
    );
  });

  it('ignores every other key', () => {
    expect(shouldStopPresentingOnEscape({ key: 'Enter', defaultPrevented: false }, true)).toBe(
      false
    );
  });
});
