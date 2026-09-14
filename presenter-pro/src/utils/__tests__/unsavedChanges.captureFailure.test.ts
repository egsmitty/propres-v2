import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan D1 (audit SAVE-A9, SAVE-A6 gate part). The Unsaved Changes dialog's
// Save wrote the row and then captured a restore point — ignoring whether the
// capture worked, and falling back to the IN-MEMORY document when the write
// returned no row (a presentation deleted from Home while open). So a failed
// restore point let the window close as "saved", and a vanished presentation
// got an orphan version row written for it.
//
// unsavedChanges.test.ts (plan A5) pins the dialog and the success paths and
// must pass unchanged.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  deletePresentation: vi.fn(),
  updatePresentation: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn(), showDialog: vi.fn() }));
vi.mock('@/utils/autosaveSync', () => ({ cancelPendingAutosave: vi.fn() }));
vi.mock('@/utils/presentationVersionsSync', () => ({
  captureVersion: vi.fn(),
  revertToLatestVersion: vi.fn(),
}));

import { updatePresentation } from '@/utils/ipc';
import { alertDialog, showDialog } from '@/utils/dialog';
import { captureVersion } from '@/utils/presentationVersionsSync';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';

const PRESENTATION = { id: 7, title: 'Sunday Morning', sections: [] };

function args() {
  return {
    presentation: PRESENTATION,
    isDirty: true,
    requiresInitialSave: false,
    setDirty: vi.fn(),
    setRequiresInitialSave: vi.fn(),
    actionLabel: 'close the window',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(showDialog).mockResolvedValue({ action: 'save' });
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: PRESENTATION });
  vi.mocked(captureVersion).mockResolvedValue(true);
  vi.mocked(alertDialog).mockResolvedValue(undefined);
});

describe('Unsaved Changes ▸ Save', () => {
  it('does not let you leave when the restore point could not be recorded', async () => {
    vi.mocked(captureVersion).mockResolvedValue(false);
    const input = args();

    await expect(resolveUnsavedChanges(input)).resolves.toBe(false);

    expect(input.setDirty).not.toHaveBeenCalled();
    expect(vi.mocked(alertDialog).mock.calls.map((call) => call[1])).toEqual([
      { title: 'Restore Point Not Saved' },
    ]);
  });

  it('does not treat a presentation that no longer exists as saved, and writes no version for it', async () => {
    vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: null });
    const input = args();

    await expect(resolveUnsavedChanges(input)).resolves.toBe(false);

    expect(captureVersion).not.toHaveBeenCalled();
    expect(input.setDirty).not.toHaveBeenCalled();
    expect(vi.mocked(alertDialog).mock.calls.map((call) => call[1])).toEqual([
      { title: 'Save Failed' },
    ]);
  });
});
