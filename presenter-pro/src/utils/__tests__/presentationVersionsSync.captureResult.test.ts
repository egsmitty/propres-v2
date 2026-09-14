import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan D1 (audit SAVE-B4, SAVE-A9). Two ways a restore point could fail
// without anyone being told.
//
// - SAVE-B4: `captureVersion` returned `result?.success !== false`, so a write
//   that came back with no envelope at all (null / undefined) counted as a
//   recorded restore point.
// - SAVE-A9: restore and revert each END with a capture that re-establishes
//   THE INVARIANT (the newest version equals the document). Its result was
//   ignored, so a failure left the history one step behind with nothing said.
//
// presentationVersionsSync.test.ts (plans A5, A6) must pass unchanged.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  writeVersion: vi.fn(),
  getVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  listVersionSummaries: vi.fn(),
  deleteVersionsFor: vi.fn(),
  updatePresentation: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));
vi.mock('@/utils/autosaveSync', () => ({ cancelPendingAutosave: vi.fn() }));

import { getLatestVersion, getVersion, updatePresentation, writeVersion } from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import {
  captureVersion,
  restoreVersion,
  revertToLatestVersion,
} from '@/utils/presentationVersionsSync';

const INITIAL_STATE = useEditorStore.getState();

const CURRENT = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Now' }] },
  ],
  aspectRatio: '16:9',
};
const OLDER = {
  ...CURRENT,
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Before' }] },
  ],
};

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  useEditorStore.setState({ presentation: CURRENT, presentationId: 7, isDirty: true });
  vi.mocked(alertDialog).mockResolvedValue(undefined);
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: OLDER });
});

function alertTitles(): unknown[] {
  return vi.mocked(alertDialog).mock.calls.map((call) => (call[1] as { title?: string })?.title);
}

describe('captureVersion (SAVE-B4)', () => {
  beforeEach(() => {
    vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
  });

  it('is false when the write returns no envelope at all', async () => {
    vi.mocked(writeVersion).mockResolvedValue(null as never);
    await expect(captureVersion(CURRENT)).resolves.toBe(false);
  });

  it('is false when the write returns an envelope without success', async () => {
    vi.mocked(writeVersion).mockResolvedValue({} as never);
    await expect(captureVersion(CURRENT)).resolves.toBe(false);
  });

  it('is true only when the write reports success', async () => {
    vi.mocked(writeVersion).mockResolvedValue({ success: true });
    await expect(captureVersion(CURRENT)).resolves.toBe(true);
  });
});

describe('the closing capture after restore and revert (SAVE-A9)', () => {
  it('restoreVersion restores, but says so when Version History could not record it', async () => {
    vi.mocked(getVersion).mockResolvedValue({
      success: true,
      data: { id: 5, presentation_id: 7, snapshot: JSON.stringify(OLDER), saved_at: 1 },
    });
    // Both captures see no newest version, so both must write: the first
    // (preserve the current state) succeeds, the closing one fails.
    vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
    vi.mocked(writeVersion)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'disk full' });

    await expect(restoreVersion(5)).resolves.toBe(true);

    expect(writeVersion).toHaveBeenCalledTimes(2);
    expect(alertTitles()).toEqual(['Restore Point Not Saved']);
  });

  it('revertToLatestVersion reverts, but says so when Version History could not record it', async () => {
    const newest = { id: 9, presentation_id: 7, snapshot: JSON.stringify(OLDER), saved_at: 1 };
    // 1st read: the revert target. 2nd: the pre-revert capture compares against
    // it (the current document differs, so it writes). 3rd: the closing capture
    // finds nothing newer and must write.
    vi.mocked(getLatestVersion)
      .mockResolvedValueOnce({ success: true, data: newest })
      .mockResolvedValueOnce({ success: true, data: newest })
      .mockResolvedValueOnce({ success: true, data: null });
    vi.mocked(writeVersion)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'disk full' });

    await expect(revertToLatestVersion(7, { navigate: false })).resolves.toBe(true);

    expect(writeVersion).toHaveBeenCalledTimes(2);
    expect(alertTitles()).toEqual(['Restore Point Not Saved']);
  });
});
