import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  getLatestVersion: vi.fn(),
  deleteVersionsFor: vi.fn(),
  listVersions: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  alertDialog: vi.fn(),
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
}));
vi.mock('@/utils/builtInSongSeed', () => ({ ensureBuiltInSongsSeeded: vi.fn() }));

import {
  createPresentation,
  getLatestVersion,
  getPresentation,
  touchPresentation,
  updatePresentation,
  writeVersion,
} from '@/utils/ipc';
import { confirmDialog, alertDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import {
  createNewPresentation,
  openPresentationInEditor,
  renamePresentationById,
  revertCurrentPresentationToLastSave,
  saveCurrentPresentation,
  saveCurrentPresentationAs,
} from '@/utils/presentationCommands';

// Plan A5 slice 1. Every path that writes a presentation row must leave the
// restore points correct. The double-capture cases (2, 3, 4) exist because
// three of these helpers call openPresentationInEditor internally, so an extra
// captureVersion at the outer level would append a second identical row.

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
  vi.mocked(touchPresentation).mockResolvedValue({ success: true });
  vi.mocked(getPresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(createPresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(writeVersion).mockResolvedValue({ success: true });
  // No restore point exists yet unless a test says otherwise.
  vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
});

describe('restore points across every write path', () => {
  it('openPresentationInEditor gives a presentation its first version', async () => {
    await openPresentationInEditor(7);
    expect(writeVersion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeVersion).mock.calls[0]![0]).toMatchObject({ presentationId: 7 });
  });

  it('openPresentationInEditor does not append when a version already exists', async () => {
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 1, presentation_id: 7, snapshot: '{}', saved_at: 1 },
    });
    await openPresentationInEditor(7);
    expect(writeVersion).toHaveBeenCalledTimes(0);
  });

  it('marks a new presentation unsaved BEFORE the version I/O settles', async () => {
    // Regression (CI, 2026-09-09). The flags used to be set after
    // openPresentationInEditor resolved, so on a slow machine a quit landing
    // during the version round trips saw a clean document and skipped the
    // Unsaved Changes gate entirely — losing the new presentation silently.
    let releaseWrite: () => void = () => {};
    vi.mocked(writeVersion).mockReturnValue(
      new Promise((resolve) => {
        releaseWrite = () => resolve({ success: true });
      }) as ReturnType<typeof writeVersion>
    );

    const pending = createNewPresentation();
    // Let the synchronous part and the pre-version awaits run, but leave
    // writeVersion hanging — the window the race lived in.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    expect(useEditorStore.getState().requiresInitialSave).toBe(true);

    releaseWrite();
    await pending;
    expect(useEditorStore.getState().requiresInitialSave).toBe(true);
  });

  it('createNewPresentation writes EXACTLY ONE version, not two', async () => {
    await createNewPresentation();
    // It routes through openPresentationInEditor, which already captured.
    expect(writeVersion).toHaveBeenCalledTimes(1);
  });

  it('saveCurrentPresentationAs writes EXACTLY ONE version for the new row', async () => {
    useEditorStore.setState({ presentation: ROW, presentationId: 7 });
    vi.mocked(confirmDialog).mockResolvedValue(true);
    const { promptDialog } = await import('@/utils/dialog');
    vi.mocked(promptDialog).mockResolvedValue('Copy');

    await saveCurrentPresentationAs();
    expect(writeVersion).toHaveBeenCalledTimes(1);
  });

  it('saveCurrentPresentation captures the row that came back from the write', async () => {
    useEditorStore.setState({ presentation: ROW, presentationId: 7, isDirty: true });
    await saveCurrentPresentation();
    expect(writeVersion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeVersion).mock.calls[0]![0]).toMatchObject({ presentationId: 7 });
  });

  it('renamePresentationById captures a version so the row cannot drift', async () => {
    const { promptDialog } = await import('@/utils/dialog');
    vi.mocked(promptDialog).mockResolvedValue('New Name');
    await renamePresentationById(7, 'Sunday Morning');
    // Without this, renaming from Home makes the row diverge from its newest
    // version and the presentation opens dirty forever.
    expect(writeVersion).toHaveBeenCalledTimes(1);
  });

  it('a second content-identical save appends nothing', async () => {
    useEditorStore.setState({ presentation: ROW, presentationId: 7, isDirty: true });
    await saveCurrentPresentation();

    // Every capture site snapshots a NORMALIZED presentation, so that is what a
    // stored snapshot looks like. Feeding a raw row here would compare a
    // normalized document against an un-normalized one and diverge for reasons
    // that cannot occur in production (plan A5, pitfall 2).
    const stored = vi.mocked(writeVersion).mock.calls[0]![0] as { snapshot: string };
    vi.mocked(getLatestVersion).mockResolvedValue({
      success: true,
      data: { id: 1, presentation_id: 7, snapshot: stored.snapshot, saved_at: 1 },
    });

    await saveCurrentPresentation();
    // Reflexive Cmd-S must not append: 25 of them would prune away every real
    // restore point.
    expect(writeVersion).toHaveBeenCalledTimes(1);
  });
});

describe('revertCurrentPresentationToLastSave', () => {
  it('does not prompt and alerts when the document is clean', async () => {
    useEditorStore.setState({ presentation: ROW, presentationId: 7, isDirty: false });
    expect(await revertCurrentPresentationToLastSave()).toBe(false);
    expect(confirmDialog).toHaveBeenCalledTimes(0);
    // The native menu item cannot be greyed out, so this must fail loudly.
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });

  it('does not prompt and alerts on a never-saved presentation', async () => {
    useEditorStore.setState({
      presentation: ROW,
      presentationId: 7,
      isDirty: true,
      requiresInitialSave: true,
    });
    expect(await revertCurrentPresentationToLastSave()).toBe(false);
    expect(confirmDialog).toHaveBeenCalledTimes(0);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the confirmation is cancelled', async () => {
    useEditorStore.setState({ presentation: ROW, presentationId: 7, isDirty: true });
    vi.mocked(confirmDialog).mockResolvedValue(false);
    expect(await revertCurrentPresentationToLastSave()).toBe(false);
    expect(updatePresentation).toHaveBeenCalledTimes(0);
  });
});
