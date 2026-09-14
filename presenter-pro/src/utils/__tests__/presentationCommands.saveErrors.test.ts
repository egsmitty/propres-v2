import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan D1 (audit SAVE-A7, SAVE-A8, SAVE-A9). What happens when a save does NOT
// go through.
//
// - SAVE-A8: File ▸ Save and ⌘S reach `saveCurrentPresentation` through
//   `appCommands`, which drops the result — so a failed save said nothing.
//   Only the editor's own button path showed "Save Failed".
// - SAVE-A7: a write to a presentation that no longer exists comes back
//   `{ success: true, data: null }`, and that branch marked the document saved.
// - SAVE-A9: `captureVersion`'s result was ignored, and the dirty flag was
//   already cleared — a failed restore point showed "Saved" while the newest
//   version lagged the row.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  createPresentation: vi.fn(),
  createMedia: vi.fn(),
  deletePresentation: vi.fn(),
  getMedia: vi.fn(),
  getSongs: vi.fn(),
  pickMedia: vi.fn(),
  getPresentation: vi.fn(),
  resolveBuiltInMedia: vi.fn(),
  touchPresentation: vi.fn(),
  updatePresentation: vi.fn(),
  writeVersion: vi.fn(),
  getVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  listVersionSummaries: vi.fn(),
  deleteVersionsFor: vi.fn(),
  listVersions: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  alertDialog: vi.fn(),
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
}));
vi.mock('@/utils/builtInSongSeed', () => ({ ensureBuiltInSongsSeeded: vi.fn() }));

import { getLatestVersion, getPresentation, updatePresentation, writeVersion } from '@/utils/ipc';
import { alertDialog, promptDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import { renamePresentationById, saveCurrentPresentation } from '@/utils/presentationCommands';

const INITIAL_STATE = useEditorStore.getState();

const ROW = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Hi' }] },
  ],
  aspectRatio: '16:9',
};

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  useEditorStore.setState({ presentation: ROW, presentationId: 7, isDirty: true });
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(writeVersion).mockResolvedValue({ success: true });
  vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
  vi.mocked(getPresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(alertDialog).mockResolvedValue(undefined);
});

function alertTitles(): unknown[] {
  return vi.mocked(alertDialog).mock.calls.map((call) => (call[1] as { title?: string })?.title);
}

describe('saveCurrentPresentation when the save fails', () => {
  it('a failed write says so, and the document stays unsaved (SAVE-A8)', async () => {
    vi.mocked(updatePresentation).mockResolvedValue({
      success: false,
      error: 'database is locked',
    });

    const result = await saveCurrentPresentation();

    expect(result?.success).toBe(false);
    expect(vi.mocked(alertDialog).mock.calls).toEqual([
      ['database is locked', { title: 'Save Failed' }],
    ]);
    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(writeVersion).not.toHaveBeenCalled();
  });

  it('a presentation that no longer exists is not reported as saved (SAVE-A7)', async () => {
    vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: null });

    const result = await saveCurrentPresentation();

    expect(result?.success).toBe(false);
    // `saveCurrentPresentation` is plain JS, so its inferred return type does not
    // carry `error` on every branch; the cast is type-only.
    expect(String((result as { error?: string } | null)?.error)).toMatch(/no longer exists/i);
    expect(alertTitles()).toEqual(['Save Failed']);
    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(writeVersion).not.toHaveBeenCalled();
  });

  it('a restore point that could not be recorded says so and leaves the document unsaved (SAVE-A9)', async () => {
    vi.mocked(writeVersion).mockResolvedValue({ success: false, error: 'disk full' });

    const result = await saveCurrentPresentation();

    expect(result?.success).toBe(false);
    expect(alertTitles()).toEqual(['Restore Point Not Saved']);
    // The row IS written, but without its restore point the document is not
    // committed — "Saved" would be a lie the next open exposes.
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('a save that works shows no alert and clears the unsaved state', async () => {
    const result = await saveCurrentPresentation();

    expect(result?.success).toBe(true);
    expect(alertDialog).not.toHaveBeenCalled();
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});

describe('renamePresentationById when its restore point fails (SAVE-A9)', () => {
  it('says so instead of carrying on silently', async () => {
    vi.mocked(promptDialog).mockResolvedValue('Easter Sunday');
    vi.mocked(updatePresentation).mockResolvedValue({
      success: true,
      data: { ...ROW, title: 'Easter Sunday' },
    });
    vi.mocked(writeVersion).mockResolvedValue({ success: false, error: 'disk full' });

    await renamePresentationById(7, 'Sunday Morning');

    expect(alertTitles()).toEqual(['Restore Point Not Saved']);
  });
});
