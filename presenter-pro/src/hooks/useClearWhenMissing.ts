/**
 * Clears a selection the moment the selected item is no longer among the
 * items that can be selected — plan D2 #10/#16.
 *
 * Runs during render (React's "adjust state while rendering" pattern) rather
 * than in an effect, so the render that loses the item never commits with a
 * stale selection. `clear` must only set state owned by the calling component.
 */
export function useClearWhenMissing(
  selectedId: string | number | null | undefined,
  isPresent: boolean,
  clear: () => void
): void {
  if (selectedId != null && !isPresent) clear();
}
