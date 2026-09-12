import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { cancelPendingAutosave } from '@/utils/autosaveSync';
import { useEditorStore } from '@/store/editorStore';
import {
  VERSION_EXEMPT_PRESENTATION_IDS,
  captureVersion,
  ensureVersion,
  isDivergedFromLatest,
  restoreVersion,
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

  it('cancels the pending autosave BEFORE reading anything', async () => {
    const order: string[] = [];
    vi.mocked(cancelPendingAutosave).mockImplementation(() => void order.push('cancel'));
    vi.mocked(getLatestVersion).mockImplementation(async () => {
      order.push('read');
      return {
        success: true,
        data: { id: 3, presentation_id: 7, snapshot: snapshotOf(STORED), saved_at: 1 },
      };
    });

    await revertToLatestVersion(7);

    // Every step below the cancel yields. A debounced autosave firing mid-revert
    // would issue its write AFTER the revert's and leave the reverted-away
    // edits in the row, while the editor showed the reverted document.
    expect(order[0]).toBe('cancel');
  });

  it('appends the pre-revert state, and still restores the version that was newest before', async () => {
    // BEHAVIOUR CHANGE (plan A6). A5 said "revert never appends"; now it does,
    // so a revert is recoverable. The ORDER is the whole trick: the target is
    // read BEFORE the append, or the state just saved becomes its own target
    // and the revert is a silent no-op that looks like it worked.
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: true });
    await revertToLatestVersion(7);

    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, STORED]]);
    const snapshots = vi
      .mocked(writeVersion)
      .mock.calls.map((c) => (c[0] as { snapshot: string }).snapshot);
    expect(snapshots[0]).toBe(snapshotOf(PRESENTATION)); // the pre-revert state
  });

  it('writes no version at all with { capture: false } — that is Discard', async () => {
    // Discard means "this never happened". Appending the work the user asked to
    // throw away would put it in the history list beside real saves, and the
    // retention rule that never drops the newest would pin it there.
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: true });
    await revertToLatestVersion(7, { capture: false });
    expect(writeVersion).toHaveBeenCalledTimes(0);
    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, STORED]]);
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

describe('restoreVersion', () => {
  const OLD = { ...PRESENTATION, title: 'Two Sundays Ago' };

  /**
   * A STATEFUL fake: writeVersion appends, getLatestVersion returns the last.
   * Without this the invariant test would be circular — it has to observe what
   * the code actually wrote.
   */
  function useVersionStore(initial: unknown[] = []) {
    const rows = initial.map((snapshot, i) => ({
      id: i + 1,
      presentation_id: 7,
      snapshot: snapshotOf(snapshot),
      saved_at: i + 1,
    }));
    vi.mocked(writeVersion).mockImplementation(async (data) => {
      const { presentationId, snapshot } = data as { presentationId: number; snapshot: string };
      rows.push({
        id: rows.length + 1,
        presentation_id: presentationId,
        snapshot,
        saved_at: rows.length + 1,
      });
      return { success: true };
    });
    vi.mocked(getLatestVersion).mockImplementation(async () => ({
      success: true,
      data: rows.length ? rows[rows.length - 1] : null,
    }));
    vi.mocked(getVersion).mockImplementation(async (id) => ({
      success: true,
      data: rows.find((r) => r.id === id) ?? null,
    }));
    return rows;
  }

  beforeEach(() => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: false });
    vi.mocked(updatePresentation).mockImplementation(async (_id, data) => ({
      success: true,
      data: data as Record<string, unknown>,
    }));
  });

  it('KEEPS THE INVARIANT: the newest version equals the document afterwards', async () => {
    // This is the assertion the first draft of plan A6 would have failed. Break
    // it and every restored presentation opens "Unsaved changes" forever, and
    // Revert to Last Save restores the thing you just restored away from.
    useVersionStore([OLD, PRESENTATION]);

    expect(await restoreVersion(1)).toBe(true);
    expect(await isDivergedFromLatest(useEditorStore.getState().presentation)).toBe(false);
  });

  it('keeps the pre-restore state reachable, which is what makes restore undoable', async () => {
    const rows = useVersionStore([OLD, PRESENTATION]);
    await restoreVersion(1);
    const snapshots = rows.map((r) => r.snapshot);
    expect(snapshots).toContain(snapshotOf(PRESENTATION));
  });

  it('cancels the pending autosave before anything else', async () => {
    const order: string[] = [];
    vi.mocked(cancelPendingAutosave).mockImplementation(() => void order.push('cancel'));
    useVersionStore([OLD, PRESENTATION]);
    vi.mocked(getVersion).mockImplementation(async () => {
      order.push('read');
      return {
        success: true,
        data: { id: 1, presentation_id: 7, snapshot: snapshotOf(OLD), saved_at: 1 },
      };
    });
    await restoreVersion(1);
    expect(order[0]).toBe('cancel');
  });

  it('refuses a version belonging to a different presentation', async () => {
    vi.mocked(getVersion).mockResolvedValue({
      success: true,
      data: { id: 9, presentation_id: 99, snapshot: snapshotOf(OLD), saved_at: 1 },
    });
    expect(await restoreVersion(9)).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });

  it('alerts and changes nothing for a missing, unparseable or non-document version', async () => {
    for (const data of [
      null,
      { id: 1, presentation_id: 7, snapshot: '{not json', saved_at: 1 },
      { id: 1, presentation_id: 7, snapshot: 'null', saved_at: 1 },
    ]) {
      vi.clearAllMocks();
      vi.mocked(getVersion).mockResolvedValue({ success: true, data });
      expect(await restoreVersion(1)).toBe(false);
      expect(updatePresentation).toHaveBeenCalledTimes(0);
      expect(alertDialog).toHaveBeenCalledTimes(1);
    }
  });

  it('aborts BEFORE touching the document when the version write fails', async () => {
    // "Restoring is undoable" is the one promise this feature makes. If the
    // restore point cannot be written, overwriting the document anyway breaks
    // it silently at exactly the moment it matters.
    vi.mocked(getVersion).mockResolvedValue({
      success: true,
      data: { id: 1, presentation_id: 7, snapshot: snapshotOf(OLD), saved_at: 1 },
    });
    vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
    vi.mocked(writeVersion).mockResolvedValue({ success: false, error: 'disk full' });

    expect(await restoreVersion(1)).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });

  it('does not blank the editor when the document write fails', async () => {
    useVersionStore([OLD, PRESENTATION]);
    vi.mocked(updatePresentation).mockResolvedValue({ success: false, error: 'db locked' });
    expect(await restoreVersion(1)).toBe(false);
    expect(useEditorStore.getState().presentation).not.toBeNull();
  });
});

describe('escape hatch', () => {
  it('has no exempt presentation ids', () => {
    expect(VERSION_EXEMPT_PRESENTATION_IDS).toEqual([]);
  });
});
