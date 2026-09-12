/**
 * Canvas geometry — resize-from-centre, rotation, snapping and rect maths
 * (plan F1).
 *
 * These functions ran only while a pointer was down, inside `Canvas.jsx`, where
 * nothing could reach them: jsdom returns zeros from `getBoundingClientRect()`,
 * so a rendering test can never exercise them. They are pure and always were —
 * they are here, unchanged, so that they can be tested.
 *
 * Every function works in NATIVE slide coordinates (1920x1080 and friends),
 * never in measured screen pixels. Callers scale on the way in and out.
 */

/** A box in native slide coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Handle directions: -1, 0 or 1 per axis. */
export interface HandleDirection {
  x: number;
  y: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: {
    vertical: number | null;
    horizontal: number | null;
  };
}

export const SNAP_THRESHOLD = 8;
export const MIN_TEXT_BOX_WIDTH = 20;
export const MIN_TEXT_BOX_HEIGHT = 20;
export const ROTATION_SNAP = 15;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getResizeHandleCode(handle: string | null | undefined): string {
  return String(handle || '').replace(/^resize_/, '');
}

export function getResizeHandleDirections(handle: string | null | undefined): HandleDirection {
  const code = getResizeHandleCode(handle);
  return {
    x: code.includes('e') ? 1 : code.includes('w') ? -1 : 0,
    y: code.includes('s') ? 1 : code.includes('n') ? -1 : 0,
  };
}

export function resizeBoxFromCenter<T extends Rect>(
  box: T,
  handle: string | null | undefined,
  pointerX: number,
  pointerY: number,
  nativeW: number,
  nativeH: number,
  keepRatio = false
): T {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const maxWidth = 2 * Math.min(centerX, nativeW - centerX);
  const maxHeight = 2 * Math.min(centerY, nativeH - centerY);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const direction = getResizeHandleDirections(handle);

  let width = box.width;
  let height = box.height;

  if (keepRatio && direction.x && direction.y) {
    const scaleX = halfWidth > 0 ? (halfWidth + direction.x * pointerX) / halfWidth : 1;
    const scaleY = halfHeight > 0 ? (halfHeight + direction.y * pointerY) / halfHeight : 1;
    let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    const minScale = Math.max(
      MIN_TEXT_BOX_WIDTH / Math.max(1, box.width),
      MIN_TEXT_BOX_HEIGHT / Math.max(1, box.height)
    );
    const maxScale = Math.min(
      maxWidth / Math.max(1, box.width),
      maxHeight / Math.max(1, box.height)
    );

    scale = clamp(scale, minScale, maxScale);
    width = clamp(box.width * scale, MIN_TEXT_BOX_WIDTH, maxWidth);
    height = clamp(box.height * scale, MIN_TEXT_BOX_HEIGHT, maxHeight);
  } else {
    if (direction.x) {
      const nextHalfWidth = halfWidth + direction.x * pointerX;
      width = clamp(nextHalfWidth * 2, MIN_TEXT_BOX_WIDTH, maxWidth);
    }
    if (direction.y) {
      const nextHalfHeight = halfHeight + direction.y * pointerY;
      height = clamp(nextHalfHeight * 2, MIN_TEXT_BOX_HEIGHT, maxHeight);
    }
  }

  return {
    ...box,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function normalizeRect(startX: number, startY: number, endX: number, endY: number): Rect {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  return { x: left, y: top, width, height };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function boxBounds(box: Rect) {
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2,
  };
}

export function snapGroupToGuides(
  movingBoxes: Rect[],
  otherBoxes: Rect[],
  nativeWidth: number,
  nativeHeight: number
): SnapResult {
  if (!movingBoxes.length) return { dx: 0, dy: 0, guides: { vertical: null, horizontal: null } };

  const threshold = SNAP_THRESHOLD;
  const group = movingBoxes.reduce(
    (acc, box) => ({
      left: Math.min(acc.left, box.x),
      top: Math.min(acc.top, box.y),
      right: Math.max(acc.right, box.x + box.width),
      bottom: Math.max(acc.bottom, box.y + box.height),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  );
  const width = group.right - group.left;
  const height = group.bottom - group.top;
  const centerX = group.left + width / 2;
  const centerY = group.top + height / 2;

  const verticalCandidates = [{ value: nativeWidth / 2, source: centerX, guide: nativeWidth / 2 }];
  const horizontalCandidates = [
    { value: nativeHeight / 2, source: centerY, guide: nativeHeight / 2 },
  ];

  otherBoxes.forEach((box) => {
    const bounds = boxBounds(box);
    verticalCandidates.push(
      { value: bounds.left, source: group.left, guide: bounds.left },
      { value: bounds.right, source: group.right, guide: bounds.right },
      { value: bounds.centerX, source: centerX, guide: bounds.centerX }
    );
    horizontalCandidates.push(
      { value: bounds.top, source: group.top, guide: bounds.top },
      { value: bounds.bottom, source: group.bottom, guide: bounds.bottom },
      { value: bounds.centerY, source: centerY, guide: bounds.centerY }
    );
  });

  let bestVertical: { delta: number; distance: number; guide: number | null } = {
    delta: 0,
    distance: Infinity,
    guide: null,
  };
  let bestHorizontal: { delta: number; distance: number; guide: number | null } = {
    delta: 0,
    distance: Infinity,
    guide: null,
  };

  verticalCandidates.forEach((candidate) => {
    const delta = candidate.value - candidate.source;
    const distance = Math.abs(delta);
    if (distance <= threshold && distance < bestVertical.distance) {
      bestVertical = { delta, distance, guide: candidate.guide };
    }
  });

  horizontalCandidates.forEach((candidate) => {
    const delta = candidate.value - candidate.source;
    const distance = Math.abs(delta);
    if (distance <= threshold && distance < bestHorizontal.distance) {
      bestHorizontal = { delta, distance, guide: candidate.guide };
    }
  });

  return {
    dx: bestVertical.guide === null ? 0 : bestVertical.delta,
    dy: bestHorizontal.guide === null ? 0 : bestHorizontal.delta,
    guides: {
      vertical: bestVertical.guide,
      horizontal: bestHorizontal.guide,
    },
  };
}

export function getRotationFromPointer(
  box: Rect,
  pointerX: number,
  pointerY: number,
  shiftKey: boolean
): number {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const angle = Math.atan2(pointerY - centerY, pointerX - centerX) * (180 / Math.PI) + 90;
  if (!shiftKey) return angle;
  return Math.round(angle / ROTATION_SNAP) * ROTATION_SNAP;
}

export function handleCursor(mode: string | null | undefined): string {
  if (mode === 'move') return 'move';
  if (mode === 'rotate') return 'crosshair';
  if (mode === 'resize_nw' || mode === 'resize_se') return 'nwse-resize';
  if (mode === 'resize_ne' || mode === 'resize_sw') return 'nesw-resize';
  if (mode === 'resize_n' || mode === 'resize_s') return 'ns-resize';
  if (mode === 'resize_e' || mode === 'resize_w') return 'ew-resize';
  return 'default';
}
