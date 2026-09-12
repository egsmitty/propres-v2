import { describe, it, expect } from 'vitest';
import { DEFAULT_NAMES, commitName } from '@/utils/nameDraft';

// Plan G1. One answer to "what does an empty name mean?", in one place.
//
// The rule this pins: a draft is free-form WHILE YOU TYPE, and the empty-name
// decision happens once, at commit. Everything here is commit-time — there is
// deliberately no "normalize as you type" function to call, because that is the
// bug this module exists to prevent.

describe('commitName', () => {
  it('keeps the name exactly as typed', () => {
    expect(commitName('Sunday Service', 'Untitled')).toBe('Sunday Service');
  });

  it('trims only at commit, and only the edges', () => {
    // The trailing space is what you could not type before; it survives the
    // keystroke and is tidied once, here.
    expect(commitName('  Sunday Service  ', 'Untitled')).toBe('Sunday Service');
    // Inner spacing is the user's business.
    expect(commitName('Sunday   Service', 'Untitled')).toBe('Sunday   Service');
  });

  it('resolves an empty draft to the given default', () => {
    expect(commitName('', 'Untitled Presentation')).toBe('Untitled Presentation');
    expect(commitName('   ', 'Untitled Presentation')).toBe('Untitled Presentation');
  });

  it('resolves a missing draft to the default rather than throwing', () => {
    expect(commitName(null, 'Untitled Presentation')).toBe('Untitled Presentation');
    expect(commitName(undefined, 'Untitled Presentation')).toBe('Untitled Presentation');
  });

  it('never returns an empty string, even when the default is empty', () => {
    // A caller that passes nothing sensible still gets a usable name, because
    // an unnamed row is what started all of this.
    expect(commitName('', '')).toBe(DEFAULT_NAMES.presentation);
  });
});

describe('DEFAULT_NAMES', () => {
  it('documents the defaults in one place', () => {
    expect(DEFAULT_NAMES.presentation).toBe('Untitled Presentation');
  });
});
