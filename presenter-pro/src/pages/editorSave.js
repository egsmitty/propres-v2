import { alertDialog } from '@/utils/dialog';
import { saveCurrentPresentation } from '@/utils/presentationCommands';

/**
 * The editor's Save, extracted from `Editor.jsx` so it can be tested without
 * mounting the whole editor (Canvas scales from measured geometry, which jsdom
 * cannot produce).
 *
 * It used to call `updatePresentation` directly and then clear `isDirty` —
 * a seventh way to write a presentation row, bypassing `saveCurrentPresentation`
 * entirely. Under plan A5 that would clear the dirty flag WITHOUT capturing a
 * restore point, so Cmd-S in the canvas would not be a commit and the document
 * would reopen dirty. It now delegates, and keeps the alert it always had.
 */
export async function saveFromEditor({ presentation, isDirty, requiresInitialSave }) {
  if (!presentation || (!isDirty && !requiresInitialSave)) return;

  const result = await saveCurrentPresentation();
  if (result?.success) return;

  await alertDialog(result?.error || 'Failed to save your presentation.', {
    title: 'Save Failed',
  });
}
