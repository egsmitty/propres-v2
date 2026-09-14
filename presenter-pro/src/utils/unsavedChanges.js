import { deletePresentation, updatePresentation } from '@/utils/ipc';
import { alertDialog, showDialog } from '@/utils/dialog';
import { cancelPendingAutosave } from '@/utils/autosaveSync';
import { captureVersion, revertToLatestVersion } from '@/utils/presentationVersionsSync';
import { normalizePresentation } from '@/utils/backgrounds';
import { useEditorStore } from '@/store/editorStore';

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

  // The store can change while the dialog sits open awaited above — autosave
  // can commit, or the presentation can be saved/deleted elsewhere — so the
  // parameters captured at click time can be stale by the time the user
  // answers. Re-read the current state and act on THAT (plan V1, audit
  // SAVE-B13), but only when the store is still tracking the SAME document —
  // otherwise (the store moved on to a different presentation, or was never
  // wired to this one) the click-time values are all there is.
  const current = useEditorStore.getState();
  const storeTracksThisDocument = current.presentation?.id === presentation.id;
  const currentPresentation = storeTracksThisDocument ? current.presentation : presentation;
  const currentRequiresInitialSave = storeTracksThisDocument
    ? current.requiresInitialSave
    : requiresInitialSave;

  if (choice === 'save') {
    cancelPendingAutosave();
    const saveResult = await updatePresentation(currentPresentation.id, currentPresentation);
    if (saveResult?.success === false) {
      await alertDialog(saveResult.error || 'Failed to save your presentation.', {
        title: 'Save Failed',
      });
      return false;
    }
    if (saveResult?.data == null) {
      // The row is gone (deleted from Home while open). Capturing the in-memory
      // copy here wrote an orphan version for a presentation that no longer
      // exists, and let the window close as "saved" (plan D1, audit SAVE-A6).
      await alertDialog('This presentation no longer exists, so it could not be saved.', {
        title: 'Save Failed',
      });
      return false;
    }
    // Save is the commit, here as everywhere else — and a commit whose restore
    // point failed is not one (plan D1, audit SAVE-A9).
    const captured = await captureVersion(normalizePresentation(saveResult.data));
    if (captured === false) {
      await alertDialog(
        'Your presentation was saved, but a restore point could not be recorded. Try saving again before you leave.',
        { title: 'Restore Point Not Saved' }
      );
      return false;
    }
    setDirty(false);
    setRequiresInitialSave?.(false);
    return true;
  }

  // discard
  cancelPendingAutosave();

  if (currentRequiresInitialSave && currentPresentation.id) {
    const deleteResult = await deletePresentation(currentPresentation.id);
    if (deleteResult?.success === false) {
      await alertDialog(deleteResult.error || 'Failed to discard your new presentation.', {
        title: 'Discard Failed',
      });
      return false;
    }
  } else if (currentPresentation.id) {
    // `navigate: false` — every caller of this is LEAVING the editor, so the
    // revert must not drag the view back to it.
    //
    // `capture: false` — Discard means "this never happened". Appending the work
    // the user just asked to throw away would put it in Version History beside
    // real saves, and the retention rule that never drops the newest version
    // would pin it there permanently.
    const reverted = await revertToLatestVersion(currentPresentation.id, {
      navigate: false,
      capture: false,
    });
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
