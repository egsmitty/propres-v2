import { describe, it, expect } from 'vitest';
import { getSelectedSlide } from '@/utils/selectedSlide';

// Plan F1. `getSelectedSlide` was defined TWICE — Canvas.jsx:62 and
// Toolbar.jsx:100 — with the same name and signature and different behaviour:
// Canvas's copy threw a TypeError on a presentation whose `sections` was
// missing, Toolbar's returned null. Both were reachable from the same store.
//
// Toolbar's null-safe version won, deliberately: it handles every input
// Canvas's did, and a TypeError while the editor paints is a crash, not a
// behaviour worth preserving. The "missing sections" case below is the test
// that fails under Canvas's old copy.

const EXPECTED_EXPORTS = ['getSelectedSlide'];

function presentation() {
  return {
    id: 'pres-1',
    sections: [
      { id: 'sec-1', slides: [{ id: 'slide-1' }, { id: 'slide-2' }] },
      { id: 'sec-2', slides: [{ id: 'slide-3' }] },
    ],
  };
}

describe('selectedSlide module surface', () => {
  it('exports exactly the helper this file tests', async () => {
    const module = await import('@/utils/selectedSlide');
    expect(Object.keys(module).sort()).toEqual(EXPECTED_EXPORTS);
  });
});

describe('getSelectedSlide', () => {
  it('finds the slide inside the named section', () => {
    expect(getSelectedSlide(presentation(), 'sec-1', 'slide-2')).toEqual({ id: 'slide-2' });
    expect(getSelectedSlide(presentation(), 'sec-2', 'slide-3')).toEqual({ id: 'slide-3' });
  });

  it('returns null when the slide is in a different section', () => {
    // The section is real and the slide is real, but not together — selection
    // state can hold this pair for a moment after a move.
    expect(getSelectedSlide(presentation(), 'sec-1', 'slide-3')).toBe(null);
  });

  it('returns null when either id matches nothing', () => {
    expect(getSelectedSlide(presentation(), 'missing', 'slide-1')).toBe(null);
    expect(getSelectedSlide(presentation(), 'sec-1', 'missing')).toBe(null);
  });

  it('returns null rather than throwing when the presentation has no sections', () => {
    // THE behaviour change this module exists to settle. Canvas's copy read
    // `presentation.sections.find(...)` unguarded and threw here.
    expect(getSelectedSlide({ id: 'pres-1' }, 'sec-1', 'slide-1')).toBe(null);
    expect(getSelectedSlide({ id: 'pres-1', sections: null }, 'sec-1', 'slide-1')).toBe(null);
  });

  it('returns null rather than throwing when the section has no slides', () => {
    const withEmptySection = { id: 'pres-1', sections: [{ id: 'sec-1' }] };
    expect(getSelectedSlide(withEmptySection, 'sec-1', 'slide-1')).toBe(null);
  });

  it('returns null when there is no presentation at all', () => {
    expect(getSelectedSlide(null, 'sec-1', 'slide-1')).toBe(null);
    expect(getSelectedSlide(undefined, 'sec-1', 'slide-1')).toBe(null);
  });
});
