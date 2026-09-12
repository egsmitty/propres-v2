import { describe, it, expect, beforeEach } from 'vitest';
import { useDialogStore } from '@/store/dialogStore';
import { promptDialog } from '@/utils/dialog';

// Plan G1. A rename dialog used to drop an emptied name on the floor: the box
// closed, nothing changed, and nothing said why. Renaming a media file or a
// section has no obvious default to fall back on — inventing one would
// overwrite a name the user chose — so the commit is REFUSED with a message
// instead, and the prompt comes back. That is PowerPoint's rule, and the review
// names it as the alternative to Docs' default-name rule.
//
// Create prompts are untouched: there, empty still means "never mind".

const INITIAL = useDialogStore.getState();

beforeEach(() => useDialogStore.setState(INITIAL, true));

/** Resolve once a dialog is open — it may already be, since `showDialog`
 *  writes to the store synchronously. */
function waitForDialog(): Promise<{ resolve: (result: unknown) => void }> {
  return new Promise((resolve) => {
    const current = useDialogStore.getState().dialog;
    if (current) {
      resolve(current);
      return;
    }
    const stop = useDialogStore.subscribe((state) => {
      if (!state.dialog) return;
      stop();
      resolve(state.dialog);
    });
  });
}

/** Answer whatever dialog is open: `null` cancels, anything else confirms. */
async function answer(action: unknown, value?: string) {
  const dialog = await waitForDialog();
  dialog.resolve(action === null ? null : { action, values: { value } });
}

describe('promptDialog', () => {
  it('returns the trimmed value the user confirmed', async () => {
    const pending = promptDialog('Rename:', 'Old name');
    await answer('confirm', '  New name  ');
    await expect(pending).resolves.toBe('New name');
  });

  it('returns null when the user cancels', async () => {
    const pending = promptDialog('Rename:', 'Old name');
    await answer(null);
    await expect(pending).resolves.toBe(null);
  });

  it('without requireValue, an empty confirm still resolves to null', async () => {
    // Unchanged behaviour, which is what the create prompts rely on.
    const pending = promptDialog('Folder name:', '');
    await answer('confirm', '   ');
    await expect(pending).resolves.toBe(null);
  });

  it('with requireValue, an empty confirm is refused and the prompt returns', async () => {
    const pending = promptDialog('Rename:', 'Old name', {
      requireValue: 'A name is required.',
    });

    await answer('confirm', '');
    // The refusal message, then the prompt again — nothing was renamed and the
    // user was told.
    await answer(true);
    await answer('confirm', 'Second try');

    await expect(pending).resolves.toBe('Second try');
  });

  it('with requireValue, cancelling after the refusal still cancels', async () => {
    const pending = promptDialog('Rename:', 'Old name', {
      requireValue: 'A name is required.',
    });

    await answer('confirm', '');
    await answer(true);
    await answer(null);

    await expect(pending).resolves.toBe(null);
  });
});
