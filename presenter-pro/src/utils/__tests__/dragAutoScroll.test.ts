import { describe, it, expect } from 'vitest';
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_STEP_PX,
  autoScrollDirection,
} from '@/utils/dragAutoScroll';

// Plan #155-P2: edge auto-scroll math for HTML5 drags over a scrollable grid,
// ported from the Builder. Native drag-and-drop never scrolls an inner
// overflow container, so the library steers it while the pointer sits in an
// edge band. Boundaries below derive from the exported edge constant.

const TOP = 100;
const BOTTOM = 500;

describe('constants', () => {
  it('uses a 48px edge band and a 9px step', () => {
    expect(AUTO_SCROLL_EDGE_PX).toBe(48);
    expect(AUTO_SCROLL_STEP_PX).toBe(9);
  });
});

describe('autoScrollDirection', () => {
  it('scrolls up inside the top band, down inside the bottom band, and idles in between', () => {
    expect(autoScrollDirection(TOP, BOTTOM, TOP + 1)).toBe(-1);
    expect(autoScrollDirection(TOP, BOTTOM, BOTTOM - 1)).toBe(1);
    expect(autoScrollDirection(TOP, BOTTOM, (TOP + BOTTOM) / 2)).toBe(0);
  });

  it('treats the band edges exactly: strictly inside scrolls, on the line idles', () => {
    expect(autoScrollDirection(TOP, BOTTOM, TOP + AUTO_SCROLL_EDGE_PX - 1)).toBe(-1);
    expect(autoScrollDirection(TOP, BOTTOM, TOP + AUTO_SCROLL_EDGE_PX)).toBe(0);
    expect(autoScrollDirection(TOP, BOTTOM, BOTTOM - AUTO_SCROLL_EDGE_PX)).toBe(0);
    expect(autoScrollDirection(TOP, BOTTOM, BOTTOM - AUTO_SCROLL_EDGE_PX + 1)).toBe(1);
  });

  it('keeps steering toward an edge the pointer has overshot', () => {
    expect(autoScrollDirection(TOP, BOTTOM, TOP - 50)).toBe(-1);
    expect(autoScrollDirection(TOP, BOTTOM, BOTTOM + 50)).toBe(1);
  });

  it('splits a container shorter than two bands at the midline so the zones never overlap', () => {
    // 40px tall: each zone is min(48, 20) = 20px.
    expect(autoScrollDirection(0, 40, 10)).toBe(-1);
    expect(autoScrollDirection(0, 40, 30)).toBe(1);
    expect(autoScrollDirection(0, 40, 20)).toBe(0);
  });

  it('honours a custom edge band', () => {
    expect(autoScrollDirection(TOP, BOTTOM, TOP + 5, 10)).toBe(-1);
    expect(autoScrollDirection(TOP, BOTTOM, TOP + 15, 10)).toBe(0);
  });
});
