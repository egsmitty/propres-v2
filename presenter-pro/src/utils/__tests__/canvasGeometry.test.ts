import { describe, it, expect } from 'vitest';
import {
  MIN_TEXT_BOX_HEIGHT,
  MIN_TEXT_BOX_WIDTH,
  ROTATION_SNAP,
  SNAP_THRESHOLD,
  boxBounds,
  clamp,
  getResizeHandleCode,
  getResizeHandleDirections,
  getRotationFromPointer,
  handleCursor,
  normalizeRect,
  rectsIntersect,
  resizeBoxFromCenter,
  snapGroupToGuides,
} from '@/utils/canvasGeometry';

// Characterization tests (plan F1). These describe what Canvas.jsx has always
// done — every expectation below was derived from the code as it stood before
// the extraction. If one fails, the extraction is wrong; do not adjust the
// number to match.
//
// This is the most intricate logic in the app and the least observable: it runs
// only while a pointer is down, and jsdom returns zeros from
// getBoundingClientRect(), so rendering could never have tested it.

const EXPECTED_EXPORTS = [
  'MIN_TEXT_BOX_HEIGHT',
  'MIN_TEXT_BOX_WIDTH',
  'ROTATION_SNAP',
  'SNAP_THRESHOLD',
  'boxBounds',
  'clamp',
  'getResizeHandleCode',
  'getResizeHandleDirections',
  'getRotationFromPointer',
  'handleCursor',
  'normalizeRect',
  'rectsIntersect',
  'resizeBoxFromCenter',
  'snapGroupToGuides',
];

// The eight resize handles, named the way Canvas names them. Every
// handle-shaped assertion below iterates THIS list rather than a hand-picked
// sample, so a ninth handle cannot slip in untested.
const RESIZE_HANDLES = [
  'resize_n',
  'resize_s',
  'resize_e',
  'resize_w',
  'resize_ne',
  'resize_nw',
  'resize_se',
  'resize_sw',
];

const NATIVE_WIDTH = 1920;
const NATIVE_HEIGHT = 1080;

/** A 200x200 box dead centre of a 1920x1080 slide. */
function centredBox() {
  return { x: 860, y: 440, width: 200, height: 200 };
}

describe('canvasGeometry module surface', () => {
  it('exports exactly the helpers this file tests', async () => {
    const geometry = await import('@/utils/canvasGeometry');
    // Exact list, not a superset: adding an export without a test fails here
    // rather than relying on anyone's diligence.
    expect(Object.keys(geometry).sort()).toEqual(EXPECTED_EXPORTS);
  });
});

describe('constants', () => {
  it('pins the values Canvas has always used', () => {
    expect(MIN_TEXT_BOX_WIDTH).toBe(20);
    expect(MIN_TEXT_BOX_HEIGHT).toBe(20);
    expect(SNAP_THRESHOLD).toBe(8);
    expect(ROTATION_SNAP).toBe(15);
  });
});

describe('clamp', () => {
  it('returns the value when it is inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to each bound', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('lets max win when the bounds are inverted', () => {
    // Math.min(max, …) is applied last, so max beats min. Documented, not
    // endorsed — callers rely on it never happening.
    expect(clamp(5, 10, 0)).toBe(0);
  });
});

describe('getResizeHandleCode', () => {
  it('strips the resize_ prefix', () => {
    expect(getResizeHandleCode('resize_nw')).toBe('nw');
  });

  it('leaves an already-bare code alone', () => {
    expect(getResizeHandleCode('nw')).toBe('nw');
  });

  it('returns an empty string for nullish input', () => {
    expect(getResizeHandleCode(null)).toBe('');
    expect(getResizeHandleCode(undefined)).toBe('');
  });

  it('only strips the prefix, never an inner occurrence', () => {
    expect(getResizeHandleCode('resize_resize_n')).toBe('resize_n');
  });
});

describe('getResizeHandleDirections', () => {
  it('maps every handle to its axis directions', () => {
    // Exhaustive: all eight handles, both axes.
    expect(getResizeHandleDirections('resize_n')).toEqual({ x: 0, y: -1 });
    expect(getResizeHandleDirections('resize_s')).toEqual({ x: 0, y: 1 });
    expect(getResizeHandleDirections('resize_e')).toEqual({ x: 1, y: 0 });
    expect(getResizeHandleDirections('resize_w')).toEqual({ x: -1, y: 0 });
    expect(getResizeHandleDirections('resize_ne')).toEqual({ x: 1, y: -1 });
    expect(getResizeHandleDirections('resize_nw')).toEqual({ x: -1, y: -1 });
    expect(getResizeHandleDirections('resize_se')).toEqual({ x: 1, y: 1 });
    expect(getResizeHandleDirections('resize_sw')).toEqual({ x: -1, y: 1 });
  });

  it('reports no direction for a handle with neither axis', () => {
    expect(getResizeHandleDirections('')).toEqual({ x: 0, y: 0 });
  });
});

describe('resizeBoxFromCenter', () => {
  it('grows an edge handle in one axis only, keeping the centre fixed', () => {
    const box = centredBox();
    const next = resizeBoxFromCenter(box, 'resize_e', 50, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    expect(next).toEqual({ x: 810, y: 440, width: 300, height: 200 });
  });

  it('moves only the axes its handle owns, for every handle', () => {
    // The quantifier is the point: iterate the production handle list, not a
    // sample, and derive the expectation from getResizeHandleDirections.
    RESIZE_HANDLES.forEach((handle) => {
      const box = centredBox();
      const direction = getResizeHandleDirections(handle);
      const next = resizeBoxFromCenter(box, handle, 40, 40, NATIVE_WIDTH, NATIVE_HEIGHT);

      expect(next.width === box.width).toBe(direction.x === 0);
      expect(next.height === box.height).toBe(direction.y === 0);
      // Resizing is always about the centre — that is the whole contract.
      expect(next.x + next.width / 2).toBeCloseTo(box.x + box.width / 2, 10);
      expect(next.y + next.height / 2).toBeCloseTo(box.y + box.height / 2, 10);
    });
  });

  it('scales both axes together on a corner handle when keepRatio is set', () => {
    const next = resizeBoxFromCenter(centredBox(), 'resize_se', 50, 0, 1920, 1080, true);
    // The larger of the two scale deltas wins (1.5 over 1.0), and it is applied
    // to both axes.
    expect(next).toEqual({ x: 810, y: 390, width: 300, height: 300 });
  });

  it('ignores keepRatio on an edge handle, which has only one axis', () => {
    const withRatio = resizeBoxFromCenter(centredBox(), 'resize_e', 50, 0, 1920, 1080, true);
    const withoutRatio = resizeBoxFromCenter(centredBox(), 'resize_e', 50, 0, 1920, 1080, false);
    expect(withRatio).toEqual(withoutRatio);
  });

  it('never shrinks below the minimum box size', () => {
    const next = resizeBoxFromCenter(centredBox(), 'resize_se', -9999, -9999, 1920, 1080);
    expect(next.width).toBe(MIN_TEXT_BOX_WIDTH);
    expect(next.height).toBe(MIN_TEXT_BOX_HEIGHT);
  });

  it('never grows past the slide edges the box is centred within', () => {
    // Centred box: the reachable size is twice the distance to the nearer edge.
    const next = resizeBoxFromCenter(centredBox(), 'resize_se', 9999, 9999, 1920, 1080);
    expect(next.width).toBe(1920);
    expect(next.height).toBe(1080);
  });

  it('preserves every other property of the box', () => {
    const box = { ...centredBox(), id: 'box-1', rotation: 30 };
    const next = resizeBoxFromCenter(box, 'resize_e', 10, 0, 1920, 1080);
    expect(next.id).toBe('box-1');
    expect(next.rotation).toBe(30);
  });
});

describe('normalizeRect', () => {
  it('normalizes a rect dragged up and to the left', () => {
    expect(normalizeRect(10, 20, 4, 50)).toEqual({ x: 4, y: 20, width: 6, height: 30 });
  });

  it('returns a zero-size rect when start and end are the same point', () => {
    expect(normalizeRect(7, 7, 7, 7)).toEqual({ x: 7, y: 7, width: 0, height: 0 });
  });
});

describe('rectsIntersect', () => {
  const base = { x: 0, y: 0, width: 100, height: 100 };

  it('counts a shared edge as intersecting', () => {
    // `<` not `<=`: touching rects overlap, which is what marquee selection
    // has always done.
    expect(rectsIntersect(base, { x: 100, y: 0, width: 50, height: 50 })).toBe(true);
  });

  it('is true for containment, in both directions', () => {
    const inner = { x: 10, y: 10, width: 10, height: 10 };
    expect(rectsIntersect(base, inner)).toBe(true);
    expect(rectsIntersect(inner, base)).toBe(true);
  });

  it('is false when the rects are disjoint on either axis', () => {
    expect(rectsIntersect(base, { x: 101, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsIntersect(base, { x: 0, y: 101, width: 10, height: 10 })).toBe(false);
  });
});

describe('boxBounds', () => {
  it('derives every edge and the centre', () => {
    expect(boxBounds({ x: 10, y: 20, width: 100, height: 50 })).toEqual({
      left: 10,
      top: 20,
      right: 110,
      bottom: 70,
      centerX: 60,
      centerY: 45,
    });
  });
});

describe('snapGroupToGuides', () => {
  it('returns no movement and no guides for an empty group', () => {
    expect(snapGroupToGuides([], [], NATIVE_WIDTH, NATIVE_HEIGHT)).toEqual({
      dx: 0,
      dy: 0,
      guides: { vertical: null, horizontal: null },
    });
  });

  it('snaps to the slide centre on both axes when within the threshold', () => {
    const box = { x: 905, y: 485, width: 100, height: 100 }; // centre (955, 535)
    const result = snapGroupToGuides([box], [], NATIVE_WIDTH, NATIVE_HEIGHT);
    expect(result).toEqual({
      dx: 5,
      dy: 5,
      guides: { vertical: 960, horizontal: 540 },
    });
  });

  it('does not snap when the centre is outside the threshold', () => {
    // One pixel past SNAP_THRESHOLD on both axes.
    const offset = SNAP_THRESHOLD + 1;
    const box = { x: 910 - offset, y: 490 - offset, width: 100, height: 100 };
    const result = snapGroupToGuides([box], [], NATIVE_WIDTH, NATIVE_HEIGHT);
    expect(result).toEqual({
      dx: 0,
      dy: 0,
      guides: { vertical: null, horizontal: null },
    });
  });

  it('snaps to another box edge, and reports the guide it snapped to', () => {
    const moving = { x: 302, y: 100, width: 100, height: 50 };
    const other = { x: 300, y: 600, width: 100, height: 50 };
    const result = snapGroupToGuides([moving], [other], NATIVE_WIDTH, NATIVE_HEIGHT);
    expect(result.dx).toBe(-2);
    expect(result.guides.vertical).toBe(300);
    // Nothing is within reach on the other axis.
    expect(result.dy).toBe(0);
    expect(result.guides.horizontal).toBe(null);
  });

  it('snaps the whole group by its outer bounds, not per box', () => {
    const left = { x: 302, y: 100, width: 50, height: 50 };
    const right = { x: 500, y: 100, width: 50, height: 50 };
    const other = { x: 300, y: 600, width: 100, height: 50 };
    const result = snapGroupToGuides([left, right], [other], NATIVE_WIDTH, NATIVE_HEIGHT);
    // group.left is 302 — the leftmost box — so the group moves as one.
    expect(result.dx).toBe(-2);
  });
});

describe('getRotationFromPointer', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 }; // centre (50, 50)

  it('reads zero degrees when the pointer is directly above the centre', () => {
    expect(getRotationFromPointer(box, 50, 0, false)).toBe(0);
  });

  it('reads ninety degrees when the pointer is directly right of the centre', () => {
    expect(getRotationFromPointer(box, 100, 50, false)).toBe(90);
  });

  it('returns the exact angle when shift is not held', () => {
    expect(getRotationFromPointer(box, 60, 0, false)).toBeCloseTo(11.3099, 3);
  });

  it('snaps to the rotation increment when shift is held', () => {
    expect(getRotationFromPointer(box, 60, 0, true)).toBe(ROTATION_SNAP);
  });
});

describe('handleCursor', () => {
  it('maps every interaction mode to its cursor', () => {
    // Exhaustive over the modes Canvas can be in.
    expect(handleCursor('move')).toBe('move');
    expect(handleCursor('rotate')).toBe('crosshair');
    expect(handleCursor('resize_nw')).toBe('nwse-resize');
    expect(handleCursor('resize_se')).toBe('nwse-resize');
    expect(handleCursor('resize_ne')).toBe('nesw-resize');
    expect(handleCursor('resize_sw')).toBe('nesw-resize');
    expect(handleCursor('resize_n')).toBe('ns-resize');
    expect(handleCursor('resize_s')).toBe('ns-resize');
    expect(handleCursor('resize_e')).toBe('ew-resize');
    expect(handleCursor('resize_w')).toBe('ew-resize');
  });

  it('falls back to the default cursor for anything else', () => {
    expect(handleCursor(null)).toBe('default');
    expect(handleCursor('marquee')).toBe('default');
  });
});
