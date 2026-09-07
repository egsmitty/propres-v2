import { getSlideTextBoxes } from '@/utils/textBoxes';

/**
 * Whether selecting a slide should drop the user straight into text editing
 * (plan D2 slice 4). The rule Canvas used to apply in an effect, now applied by
 * the editor store inside the selection action itself:
 *
 *   - exactly one text box, and it is still empty (whitespace counts as empty)
 *   - not a media slide
 *   - not suppressed (a slide that was just inserted is selected, not edited)
 *
 * When the rule matches but is suppressed, the box is still selected so the
 * formatting toolbar has a target.
 */

interface SlideLike {
  id?: string;
  type?: string;
  [key: string]: unknown;
}
interface SectionLike {
  id?: string;
  slides?: SlideLike[];
}
export interface PresentationLike {
  sections?: SectionLike[];
}

export interface SelectionEditing {
  editingSlideId: string | null;
  selectedTextBoxIds: string[];
}

const NONE: SelectionEditing = { editingSlideId: null, selectedTextBoxIds: [] };

export function resolveSelectionEditing(
  presentation: PresentationLike | null | undefined,
  sectionId: string | null | undefined,
  slideId: string | null | undefined,
  { suppress }: { suppress: boolean }
): SelectionEditing {
  const section = presentation?.sections?.find((item) => item.id === sectionId);
  const slide = section?.slides?.find((item) => item.id === slideId);
  if (!slide) return NONE;

  const boxes = getSlideTextBoxes(slide) as Array<{ id: string; body?: string }>;
  if (boxes.length !== 1) return NONE;
  const [box] = boxes;
  if ((box!.body ?? '').trim()) return NONE;

  return {
    editingSlideId: suppress ? null : (slide.id ?? null),
    selectedTextBoxIds: [box!.id],
  };
}
