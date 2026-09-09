import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { deletePresentation, updatePresentation } from '@/utils/ipc';
import { alertDialog, showDialog } from '@/utils/dialog';
import { cancelPendingAutosave } from '@/utils/autosaveSync';
import { captureVersion, revertToLatestVersion } from '@/utils/presentationVersionsSync';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';

// CHARACTERIZATION (plan A5, todo 9 stage A). `unsavedChanges.js` had zero unit
// coverage, and slice 2 rewrites its Discard semantics from "delete or no-op"
// to "delete or revert". These cases pin what it does TODAY and must pass
// unchanged on the commit before that rewrite.

const PRESENTATION = { id: 7, title: 'Sunday Morning', sections: [] };

function args(overrides: Record<string, unknown> = {}) {
  return {
    presentation: PRESENTATION,
    isDirty: true,
    requiresInitialSave: false,
    setDirty: vi.fn(),
    setRequiresInitialSave: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: PRESENTATION });
  vi.mocked(deletePresentation).mockResolvedValue({ success: true });
  vi.mocked(revertToLatestVersion).mockResolvedValue(true);
});

describe('resolveUnsavedChanges', () => {
  it('passes straight through when there is nothing unsaved', async () => {
    const input = args({ isDirty: false, requiresInitialSave: false });
    expect(await resolveUnsavedChanges(input)).toBe(true);
    expect(showDialog).toHaveBeenCalledTimes(0);
  });

  it('offers exactly Cancel / Discard / Save, in that order', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'cancel' });
    await resolveUnsavedChanges(args());

    const config = vi.mocked(showDialog).mock.calls[0]![0] as {
      actions: Array<{ label: string }>;
    };
    // Order and count both matter: e2e/unsavedChanges.spec.ts and
    // dialog-unsaved-changes-darwin.png both pin this exact list.
    expect(config.actions.map((a) => a.label)).toEqual(['Cancel', 'Discard', 'Save']);
  });

  it('Cancel returns false and writes nothing', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'cancel' });
    const input = args();
    expect(await resolveUnsavedChanges(input)).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
    expect(deletePresentation).toHaveBeenCalledTimes(0);
    expect(input.setDirty).toHaveBeenCalledTimes(0);
  });

  it('Save writes the row and clears both flags', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'save' });
    const input = args();
    expect(await resolveUnsavedChanges(input)).toBe(true);
    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, PRESENTATION]]);
    expect(input.setDirty).toHaveBeenCalledWith(false);
    expect(input.setRequiresInitialSave).toHaveBeenCalledWith(false);
  });

  it('a failed Save alerts and returns false without clearing the flags', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'save' });
    vi.mocked(updatePresentation).mockResolvedValue({ success: false, error: 'db locked' });
    const input = args();

    expect(await resolveUnsavedChanges(input)).toBe(false);
    expect(alertDialog).toHaveBeenCalledTimes(1);
    expect(input.setDirty).toHaveBeenCalledTimes(0);
  });

  it('Discard on a never-saved presentation deletes the row', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'discard' });
    const input = args({ requiresInitialSave: true });

    expect(await resolveUnsavedChanges(input)).toBe(true);
    expect(vi.mocked(deletePresentation).mock.calls).toEqual([[7]]);
    expect(input.setDirty).toHaveBeenCalledWith(false);
  });

  it('Discard on an existing presentation REVERTS the row to its last save', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'discard' });
    const input = args({ requiresInitialSave: false });

    expect(await resolveUnsavedChanges(input)).toBe(true);
    // BEHAVIOUR CHANGE (plan A5 slice 2). This branch used to leave the row
    // alone, which was honest only while nothing wrote it. Autosave writes it
    // continuously now, so Discard has to undo those writes.
    expect(vi.mocked(revertToLatestVersion).mock.calls).toEqual([[7, { navigate: false }]]);
    expect(deletePresentation).toHaveBeenCalledTimes(0);
    expect(input.setDirty).toHaveBeenCalledWith(false);
  });

  it('a failed revert alerts and does NOT clear the flags', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'discard' });
    vi.mocked(revertToLatestVersion).mockResolvedValue(false);
    const input = args({ requiresInitialSave: false });

    // Clearing the flags here would report success while leaving the very edits
    // the user asked to discard sitting in the row.
    expect(await resolveUnsavedChanges(input)).toBe(false);
    expect(alertDialog).toHaveBeenCalledTimes(1);
    expect(input.setDirty).toHaveBeenCalledTimes(0);
  });

  it('Save also captures a restore point', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'save' });
    await resolveUnsavedChanges(args());
    expect(captureVersion).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending autosave BEFORE writing, in every non-Cancel branch', async () => {
    const order: string[] = [];
    vi.mocked(cancelPendingAutosave).mockImplementation(() => void order.push('cancel'));
    vi.mocked(updatePresentation).mockImplementation(async () => {
      order.push('write');
      return { success: true, data: PRESENTATION };
    });
    vi.mocked(revertToLatestVersion).mockImplementation(async () => {
      order.push('write');
      return true;
    });
    vi.mocked(deletePresentation).mockImplementation(async () => {
      order.push('write');
      return { success: true };
    });

    vi.mocked(showDialog).mockResolvedValue({ action: 'save' });
    await resolveUnsavedChanges(args());
    vi.mocked(showDialog).mockResolvedValue({ action: 'discard' });
    await resolveUnsavedChanges(args({ requiresInitialSave: false }));
    await resolveUnsavedChanges(args({ requiresInitialSave: true }));

    // A timer that fires after a revert would write the discarded edits back.
    expect(order).toEqual(['cancel', 'write', 'cancel', 'write', 'cancel', 'write']);
  });

  it('does NOT cancel the pending autosave on Cancel — the user is still editing', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'cancel' });
    await resolveUnsavedChanges(args());
    expect(cancelPendingAutosave).toHaveBeenCalledTimes(0);
  });

  it('a failed delete alerts and returns false', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'discard' });
    vi.mocked(deletePresentation).mockResolvedValue({ success: false, error: 'db locked' });
    const input = args({ requiresInitialSave: true });

    expect(await resolveUnsavedChanges(input)).toBe(false);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });
});
