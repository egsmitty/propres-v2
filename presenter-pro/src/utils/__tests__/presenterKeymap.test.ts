import { describe, it, expect } from 'vitest';
import { presenterActionForKey, type PresenterAction } from '@/utils/presenterKeymap';

// Plan L2 (audit LIVE-C1, LIVE-C2). The presenter panel only knew ←, → and
// Space, so presentation clickers — which send PageDown / PageUp — did nothing,
// and ↑ / ↓ moved the editor selection instead of the slide. This table mirrors
// PowerPoint's Slide Show keys and is exhaustive; its length is asserted.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

type Row = [
  description: string,
  event: Parameters<typeof presenterActionForKey>[0],
  expected: PresenterAction | null,
];

const ROWS: Row[] = [
  ['→', { key: 'ArrowRight' }, 'next'],
  ['↓', { key: 'ArrowDown' }, 'next'],
  ['PageDown (clicker forward)', { key: 'PageDown' }, 'next'],
  ['Space', { key: ' ', code: 'Space' }, 'next'],
  ['Enter', { key: 'Enter' }, 'next'],
  ['N', { key: 'n' }, 'next'],
  ['N (shifted)', { key: 'N' }, 'next'],
  ['←', { key: 'ArrowLeft' }, 'prev'],
  ['↑', { key: 'ArrowUp' }, 'prev'],
  ['PageUp (clicker back)', { key: 'PageUp' }, 'prev'],
  ['Backspace', { key: 'Backspace' }, 'prev'],
  ['P', { key: 'p' }, 'prev'],
  ['P (shifted)', { key: 'P' }, 'prev'],
  ['Home', { key: 'Home' }, 'first'],
  ['End', { key: 'End' }, 'last'],
  ['B', { key: 'b' }, 'black'],
  ['B (shifted)', { key: 'B' }, 'black'],
  ['. (clicker blank button)', { key: '.' }, 'black'],
  ['⌘→ is not a slide move', { key: 'ArrowRight', metaKey: true }, null],
  ['Ctrl+PageDown is not a slide move', { key: 'PageDown', ctrlKey: true }, null],
  ['Alt+← is not a slide move', { key: 'ArrowLeft', altKey: true }, null],
  ['⌘B is bold, not black', { key: 'b', metaKey: true }, null],
  ['Delete does nothing', { key: 'Delete' }, null],
  ['Escape is not a slide move (stop is handled elsewhere)', { key: 'Escape' }, null],
  ['an ordinary letter does nothing', { key: 'x' }, null],
];

describe('presenterActionForKey', () => {
  it('the table covers all 25 rows', () => {
    expect(ROWS).toHaveLength(25);
  });

  for (const [description, event, expected] of ROWS) {
    it(`${description} → ${expected ?? 'nothing'}`, () => {
      expect(presenterActionForKey(event)).toBe(expected);
    });
  }
});
