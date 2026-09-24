/**
 * Edge auto-scroll for HTML5 drags over a scrollable container (plan #155-P2).
 *
 * Ported unchanged from Motion-Worship Builder, `packages/templates/src/
 * editors/dragAutoScroll.ts` (#327). Native drag-and-drop does not scroll
 * inner overflow containers, so a tile dragged from low in the library grid
 * could never reach a folder scrolled out of view. Drop targets consult this
 * to steer the container while the pointer sits in an edge zone.
 */

/** Pointer band, in px from each edge, that triggers scrolling. */
export const AUTO_SCROLL_EDGE_PX = 48;

/** Scroll step per frame while the loop runs. */
export const AUTO_SCROLL_STEP_PX = 9;

/**
 * -1 = scroll up, 1 = scroll down, 0 = idle. Overshooting past an edge keeps
 * steering toward it, and containers shorter than two edge zones split at the
 * midline so the zones never overlap.
 */
export function autoScrollDirection(
  rectTop: number,
  rectBottom: number,
  clientY: number,
  edge: number = AUTO_SCROLL_EDGE_PX
): -1 | 0 | 1 {
  const height = rectBottom - rectTop;
  const zone = Math.min(edge, height / 2);
  if (clientY < rectTop + zone) return -1;
  if (clientY > rectBottom - zone) return 1;
  return 0;
}
