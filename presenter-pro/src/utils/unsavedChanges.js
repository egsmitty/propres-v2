import { deletePresentation, updatePresentation } from '@/utils/ipc';
import { alertDialog, showDialog } from '@/utils/dialog';
import { cancelPendingAutosave } from '@/utils/autosaveSync';
import { captureVersion, revertToLatestVersion } from '@/utils/presentationVersionsSync';
import { normalizePresentation } from '@/utils/backgrounds';

/**
 * The Unsaved Changes gate (Cancel / Discard / Save).
 *
 * Under autosave (plan A5) Discard can no longer be a no-op: the row has been
 * written continuously, so "discard my changes" has to put it back. Every
 * non-Cancel branch therefore cancels the pending autosave FIRST — a timer that
 * fired afterwards would write the discarded edits straight back in.
 *
 * The dialog's title, description and its three actions are unchanged; both
 * `e2e/unsavedChanges.spec.ts` and a screenshot baseline pin them.
 */
export async function resolveUnsavedChanges({
  presentation,
  isDirty,
  requiresInitialSave,
  setDirty,
  setRequiresInitialSave,
  actionLabel = 'continue',
}) {
  if (!presentation || (!isDirty && !requiresInitialSave)) return true;

  const description = requiresInitialSave
    ? `Save this new presentation before you ${actionLabel}?`
    : `You have unsaved changes. Save before you ${actionLabel}?`;

  const result = await showDialog({
    title: 'Unsaved Changes',
    description,
    actions: [
      { label: 'Cancel', value: 'cancel', cancel: true },
      { label: 'Discard', value: 'discard', variant: 'danger' },
      { label: 'Save', value: 'save', primary: true },
    ],
  });

  const choice = result?.action;
  // Cancel deliberately leaves the pending autosave running: the user is still
  // editing, and their next keystroke should still reach the record.
  if (choice === 'cancel' || !choice) return false;

  if (choice === 'save') {
    cancelPendingAutosave();
    const saveResult = await updatePresentation(presentation.id, presentation);
    if (saveResult?.success === false) {
      await alertDialog(saveResult.error || 'Failed to save your presentation.', {
        title: 'Save Failed',
      });
      return false;
    }
    // Save is the commit, here as everywhere else.
    await captureVersion(normalizePresentation(saveResult?.data ?? presentation));
    setDirty(false);
    setRequiresInitialSave?.(false);
    return true;
  }

  // discard
  cancelPendingAutosave();

  if (requiresInitialSave && presentation.id) {
    const deleteResult = await deletePresentation(presentation.id);
    if (deleteResult?.success === false) {
      await alertDialog(deleteResult.error || 'Failed to discard your new presentation.', {
        title: 'Discard Failed',
      });
      return false;
    }
  } else if (presentation.id) {
    // `navigate: false` — every caller of this is LEAVING the editor, so the
    // revert must not drag the view back to it.
    const reverted = await revertToLatestVersion(presentation.id, { navigate: false });
    if (!reverted) {
      await alertDialog('Your changes could not be discarded. They are still saved.', {
        title: 'Discard Failed',
      });
      return false;
    }
  }

  setDirty(false);
  setRequiresInitialSave?.(false);
  return true;
}
