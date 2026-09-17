import { saveCurrentPresentation } from '@/utils/presentationCommands';

/**
 * The editor's Save, extracted from `Editor.jsx` so it can be tested without
 * mounting the whole editor (Canvas scales from measured geometry, which jsdom
 * cannot produce).
 *
 * It used to call `updatePresentation` directly and then clear `isDirty` —
 * one more way to write a presentation row, bypassing `saveCurrentPresentation`
 * entirely. Under plan A5 that would clear the dirty flag WITHOUT capturing a
 * restore point, so Cmd-S in the canvas would not be a commit and the document
 * would reopen dirty. It now delegates: the failure alert lives in
 * saveCurrentPresentation, so every way of saving reports failures (plan D1),
 * and since plan SAVED1 every row write goes through `persistPresentation`, so
 * delegating is the only correct path from the editor.
 */
export async function saveFromEditor({ presentation, isDirty, requiresInitialSave }) {
  if (!presentation || (!isDirty && !requiresInitialSave)) return;

  // saveCurrentPresentation reports its own failures now (plan D1, audit
  // SAVE-A8), for every caller, so this must not alert a second time.
  await saveCurrentPresentation();
}
