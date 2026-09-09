import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/ipc', () => ({
  writeVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  deleteVersionsFor: vi.fn(),
  updatePresentation: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));

import { getLatestVersion, updatePresentation, writeVersion } from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import {
  VERSION_EXEMPT_PRESENTATION_IDS,
  captureVersion,
  ensureVersion,
  revertToLatestVersion,
} from '@/utils/presentationVersionsSync';

// Plan A5 slice 1. The restore-point wiring. Two behaviours here are
// load-bearing and were found by adversarial review of the plan:
//   - captureVersion is content-key idempotent, so reflexive Cmd-S cannot prune
//     away every genuine restore point;
//   - revertToLatestVersion guards its envelope, so a failed write can never
//     blank the open document.

const INITIAL_STATE = useEditorStore.getState();

const PRESENTATION = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Hi' }] },
  ],
  aspectRatio: '16:9',
};

function snapshotOf(value: unknown): string {
  return JSON.stringify(value);
}

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  vi.mocked(writeVersion).mockResolvedValue({ success: true });
  vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: PRESENTATION });
});

describe('captureVersion', () => {
  it('writes the snapshot with the exact payload', async () => {
    await captureVersion(PRESENTATION);
    expect(vi.mocked(writeVersion).mock.calls).toEqual([
      [{ presentationId: 7, snapshot: snapshotOf(PRESENTATION) }],
    ]);
  });

  it('is idempotent: content-identical input writes nothing a second time', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 3, presentation_id: 7, snapshot: snapshotOf(PRESENTATION), saved_at: 1 },
    });
    await captureVersion(PRESENTATION);
    // Reflexive Cmd-S is exactly the habit the append-only table exists to
    // protect against; 25 identical appends would prune away every real one.
    expect(writeVersion).toHaveBeenCalledTimes(0);
  });

  it('writes when the content differs from the newest version', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: {
        id: 3,
        presentation_id: 7,
        snapshot: snapshotOf({ ...PRESENTATION, title: 'Evening' }),
        saved_at: 1,
      },
    });
    await captureVersion(PRESENTATION);
    expect(writeVersion).toHaveBeenCalledTimes(1);
  });
});

describe('ensureVersion', () => {
  it('writes when the presentation has no version yet', async () => {
    await ensureVersion(PRESENTATION);
    expect(vi.mocked(writeVersion).mock.calls).toEqual([
      [{ presentationId: 7, snapshot: snapshotOf(PRESENTATION) }],
    ]);
  });

  it('writes nothing when a version already exists', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 3, presentation_id: 7, snapshot: '{"title":"anything"}', saved_at: 1 },
    });
    await ensureVersion(PRESENTATION);
    expect(writeVersion).toHaveBeenCalledTimes(0);
  });
});

describe('revertToLatestVersion', () => {
  const STORED = { ...PRESENTATION, title: 'Last Saved' };

  beforeEach(() => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 3, presentation_id: 7, snapshot: snapshotOf(STORED), saved_at: 1 },
    });
    vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: STORED });
  });

  it('writes the parsed snapshot back, loads it, and clears dirty', async () => {
    useEditorStore.setState({ isDirty: true });
    const result = await revertToLatestVersion(7);

    expect(result).toBe(true);
    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, STORED]]);
    expect(useEditorStore.getState().presentation?.title).toBe('Last Saved');
    expect(useEditorStore.getState().isDirty).toBe(false);
  });

  it('never appends a version — reverting is not a save', async () => {
    await revertToLatestVersion(7);
    expect(writeVersion).toHaveBeenCalledTimes(0);
  });

  it('alerts and changes nothing when there is no version to revert to', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
    useEditorStore.setState({ isDirty: true });

    expect(await revertToLatestVersion(7)).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
    expect(alertDialog).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('alerts and changes nothing when the snapshot will not parse', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 3, presentation_id: 7, snapshot: '{not json', saved_at: 1 },
    });
    expect(await revertToLatestVersion(7)).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });

  it('rejects a snapshot that parses to a non-document, e.g. JSON.parse("null")', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 3, presentation_id: 7, snapshot: 'null', saved_at: 1 },
    });
    // updatePresentation(id, null) would destructure null in the main process
    // and throw; the guard must stop before that.
    expect(await revertToLatestVersion(7)).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
  });

  it('does not blank the editor when the write fails', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: true });
    vi.mocked(updatePresentation).mockResolvedValue({ success: false, error: 'db locked' });

    expect(await revertToLatestVersion(7)).toBe(false);
    // Without the envelope guard, loadPresentationIntoEditor(undefined) sets
    // presentation to null and the open document vanishes with no error.
    expect(useEditorStore.getState().presentation).not.toBeNull();
    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });
});

describe('escape hatch', () => {
  it('has no exempt presentation ids', () => {
    expect(VERSION_EXEMPT_PRESENTATION_IDS).toEqual([]);
  });
});
