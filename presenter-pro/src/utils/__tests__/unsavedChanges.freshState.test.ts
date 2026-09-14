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
import { showDialog } from '@/utils/dialog';
import { captureVersion, revertToLatestVersion } from '@/utils/presentationVersionsSync';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';
import { useEditorStore } from '@/store/editorStore';

// Plan V1 (audit SAVE-B13). resolveUnsavedChanges received presentation /
// isDirty / requiresInitialSave as PARAMETERS captured at click time, and
// acted on them AFTER awaiting the dialog. If the store changed while the
// dialog was open — autosave committed, or the presentation was saved
// elsewhere — it acted on the stale click-time values. These cases change
// the store from inside the mocked dialog (simulating exactly that race) and
// assert the post-dialog decision used the CURRENT store state.
//
// unsavedChanges.test.ts and unsavedChanges.captureFailure.test.ts pin the
// existing dialog / success / failure paths and must pass unchanged.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

const INITIAL_STATE = useEditorStore.getState();
const STALE = { id: 7, title: 'Stale title (click-time snapshot)', sections: [] };
const FRESH = { id: 7, title: 'Fresh title (autosaved while dialog was open)', sections: [] };

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: FRESH });
  vi.mocked(captureVersion).mockResolvedValue(true);
  vi.mocked(deletePresentation).mockResolvedValue({ success: true });
  vi.mocked(revertToLatestVersion).mockResolvedValue(true);
});

function clickTimeArgs(overrides: Record<string, unknown> = {}) {
  const state = useEditorStore.getState();
  return {
    presentation: STALE,
    isDirty: true,
    requiresInitialSave: false,
    setDirty: state.setDirty,
    setRequiresInitialSave: state.setRequiresInitialSave,
    actionLabel: 'close the window',
    ...overrides,
  };
}

describe('resolveUnsavedChanges re-reads the store after the dialog resolves', () => {
  it('Save writes the CURRENT store presentation, not the click-time snapshot', async () => {
    useEditorStore.setState({ presentation: STALE, isDirty: true, requiresInitialSave: false });
    vi.mocked(showDialog).mockImplementation(async () => {
      // A concurrent autosave commits a newer edit while the dialog sits open.
      useEditorStore.setState({ presentation: FRESH, isDirty: true });
      return { action: 'save' };
    });

    await resolveUnsavedChanges(clickTimeArgs());

    // Exactness matters: the write must carry the FRESH object, not STALE.
    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, FRESH]]);
  });

  it('Discard reverts (not deletes) once requiresInitialSave flips to false while the dialog is open', async () => {
    useEditorStore.setState({ presentation: STALE, isDirty: true, requiresInitialSave: true });
    vi.mocked(showDialog).mockImplementation(async () => {
      // The presentation was saved elsewhere while the dialog sat open (e.g. a
      // concurrent autosave completed its first write for this document).
      useEditorStore.setState({ requiresInitialSave: false });
      return { action: 'discard' };
    });

    await resolveUnsavedChanges(clickTimeArgs({ requiresInitialSave: true }));

    expect(deletePresentation).not.toHaveBeenCalled();
    expect(vi.mocked(revertToLatestVersion).mock.calls).toEqual([
      [7, { navigate: false, capture: false }],
    ]);
  });
});
