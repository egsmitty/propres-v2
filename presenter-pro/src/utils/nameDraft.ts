/**
 * One answer to "what does an empty name mean?" (plan G1).
 *
 * Before this module, four surfaces renamed things and each invented its own
 * blank-state behaviour: the title bar put the old name straight back, a song
 * part regenerated its auto label mid-keystroke, and the rename dialogs dropped
 * the rename silently. None of them told you anything, and none of them let you
 * actually clear a name.
 *
 * The contract:
 *
 * 1. **A draft is free-form while you are editing it.** No trimming, no
 *    rewriting, no fallback between keystrokes. A controlled input that
 *    normalizes on change is an input that overwrites what you typed — that is
 *    how you end up unable to type a space.
 * 2. **The decision happens once, on commit** — Enter, blur, or Save.
 * 3. **It is visible.** Empty resolves to a documented default you can see and
 *    then edit, the way Google Docs commits to *Untitled document*.
 *
 * Where no sensible default exists — renaming a media file someone named — the
 * commit is instead REFUSED with a message rather than given a made-up name.
 * That path lives in `promptDialog`'s `requireValue` option, not here, because
 * refusing is a dialog behaviour rather than a value transformation.
 */

/** The documented defaults, in one place so no surface invents its own. */
export const DEFAULT_NAMES = {
  presentation: 'Untitled Presentation',
} as const;

/**
 * Resolve a finished name draft.
 *
 * Trims the edges — once, here, at commit — and falls back to `fallback` when
 * nothing is left. Inner spacing is the user's business and is preserved.
 */
export function commitName(draft: string | null | undefined, fallback: string): string {
  const trimmed = String(draft ?? '').trim();
  if (trimmed) return trimmed;
  // A caller that supplies no usable fallback still gets a usable name: an
  // unnamed row is the problem this module exists to prevent.
  return fallback.trim() || DEFAULT_NAMES.presentation;
}
