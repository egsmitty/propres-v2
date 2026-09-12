/**
 * The one `getSelectedSlide` (plan F1).
 *
 * It was defined twice — `Canvas.jsx` and `Toolbar.jsx` — with the same name
 * and signature and different behaviour: Canvas's copy read
 * `presentation.sections.find(…)` unguarded and threw a TypeError on a
 * presentation whose `sections` was missing, while Toolbar's returned null.
 * Both were reachable from the same store, so which one you got depended only
 * on which file you were reading.
 *
 * Toolbar's null-safe version wins, deliberately: it handles every input
 * Canvas's did, and a TypeError while the editor paints is a crash, not a
 * behaviour worth preserving. Canvas was internally inconsistent about this
 * anyway — two lines below its own call site it already wrote
 * `presentation?.sections?.find(…)`.
 *
 * This lives in its own module rather than in `presentationCommands.js` on
 * purpose: that module imports the stores, and importing it here would drag
 * them into Canvas's import graph.
 */

// These shapes describe only what this helper READS. A real presentation,
// section and slide each carry many more fields, so every one of them stays
// open — narrowing them here would reject the objects the store actually holds.
interface SlideLike {
  id?: string;
  [key: string]: unknown;
}

interface SectionLike {
  id?: string;
  slides?: SlideLike[];
  [key: string]: unknown;
}

interface PresentationLike {
  sections?: SectionLike[] | null;
  [key: string]: unknown;
}

export function getSelectedSlide(
  presentation: PresentationLike | null | undefined,
  selectedSectionId: string | null | undefined,
  selectedSlideId: string | null | undefined
): SlideLike | null {
  const section = presentation?.sections?.find((item) => item.id === selectedSectionId);
  if (!section) return null;
  return section.slides?.find((item) => item.id === selectedSlideId) || null;
}
