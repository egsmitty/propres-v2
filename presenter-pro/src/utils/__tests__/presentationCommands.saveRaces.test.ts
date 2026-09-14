import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Plan S2 (audit SAVE-A3, SAVE-A4). Two ways typing disappeared with no error:
//
// - SAVE-A3: ⌘S sends the document, awaits the write, then replaces the
//   editor's copy with the saved row. Anything typed while the write was on
//   its way was overwritten by the older saved copy.
// - SAVE-A4: reopening a presentation reads its row while autosave still has a
//   change scheduled; loading that older row cancels the schedule, and the
//   typing since the last write is gone.
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

import {
  getLatestVersion,
  getPresentation,
  touchPresentation,
  updatePresentation,
  writeVersion,
} from '@/utils/ipc';
import { useEditorStore } from '@/store/editorStore';
import { normalizePresentation } from '@/utils/backgrounds';
import { cancelPendingAutosave, startAutosave } from '@/utils/autosaveSync';
import { openPresentationInEditor, saveCurrentPresentation } from '@/utils/presentationCommands';

const INITIAL_STATE = useEditorStore.getState();

const ROW = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Hi' }] },
  ],
  aspectRatio: '16:9',
};

type Doc = { sections?: Array<{ slides?: Array<{ body?: string }> }> };

function withBody(presentation: Record<string, unknown>, body: string) {
  const sections = presentation.sections as Array<Record<string, unknown>>;
  const first = sections[0]!;
  const slides = first.slides as Array<Record<string, unknown>>;
  return {
    ...presentation,
    sections: [{ ...first, slides: [{ ...slides[0]!, body }] }, ...sections.slice(1)],
  };
}

function bodyOf(doc: unknown): string {
  return String((doc as Doc | null)?.sections?.[0]?.slides?.[0]?.body ?? '');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

let stop: (() => void) | null = null;

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  vi.mocked(touchPresentation).mockResolvedValue({ success: true });
  vi.mocked(getPresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: ROW });
  vi.mocked(writeVersion).mockResolvedValue({ success: true });
  vi.mocked(getLatestVersion).mockResolvedValue({ success: true, data: null });
});

afterEach(() => {
  stop?.();
  stop = null;
  cancelPendingAutosave();
  vi.useRealTimers();
});

/** An open, edited document, as the editor holds it. */
function openDirty(presentation: Record<string, unknown>) {
  useEditorStore.setState({
    presentation: normalizePresentation(presentation),
    presentationId: 7,
    isDirty: true,
    requiresInitialSave: false,
  });
  return useEditorStore.getState().presentation as Record<string, unknown>;
}

describe('⌘S while typing (SAVE-A3)', () => {
  it('keeps what was typed while the save was on its way', async () => {
    const sent = openDirty(withBody(ROW, 'Saved text'));
    const write = deferred<{ success: boolean; data: unknown }>();
    vi.mocked(updatePresentation).mockReturnValueOnce(
      write.promise as ReturnType<typeof updatePresentation>
    );

    const saving = saveCurrentPresentation();
    // An edit lands while the write is still in flight.
    useEditorStore.setState({ presentation: withBody(sent, 'Typed while saving') });
    write.resolve({ success: true, data: sent });
    await saving;

    const state = useEditorStore.getState();
    expect(bodyOf(state.presentation)).toBe('Typed while saving');
    // The row and its restore point hold the older text, so the newer edit is
    // still unsaved — and autosave will write it to the row.
    expect(state.isDirty).toBe(true);
    expect(state.requiresInitialSave).toBe(false);
  });

  it('records the restore point from what was saved, not from the newer edit', async () => {
    const sent = openDirty(withBody(ROW, 'Saved text'));
    const write = deferred<{ success: boolean; data: unknown }>();
    vi.mocked(updatePresentation).mockReturnValueOnce(
      write.promise as ReturnType<typeof updatePresentation>
    );

    const saving = saveCurrentPresentation();
    useEditorStore.setState({ presentation: withBody(sent, 'Typed while saving') });
    write.resolve({ success: true, data: sent });
    await saving;

    expect(writeVersion).toHaveBeenCalledTimes(1);
    const snapshot = JSON.parse(
      String((vi.mocked(writeVersion).mock.calls[0]?.[0] as { snapshot?: string }).snapshot)
    );
    expect(bodyOf(snapshot)).toBe('Saved text');
  });

  it('marks the document saved when nothing changed during the save (control)', async () => {
    const sent = openDirty(withBody(ROW, 'Saved text'));
    vi.mocked(updatePresentation).mockResolvedValueOnce({ success: true, data: sent });

    await saveCurrentPresentation();

    const state = useEditorStore.getState();
    expect(bodyOf(state.presentation)).toBe('Saved text');
    expect(state.isDirty).toBe(false);
    expect(writeVersion).toHaveBeenCalledTimes(1);
  });
});

describe('reopening while autosave has a change pending (SAVE-A4)', () => {
  it('writes the pending change before reading the row back', async () => {
    vi.useFakeTimers();
    let row: unknown = ROW;
    vi.mocked(updatePresentation).mockImplementation(async (_id: unknown, data: unknown) => {
      row = data;
      return { success: true, data };
    });
    vi.mocked(getPresentation).mockImplementation(async () => ({ success: true, data: row }));

    stop = startAutosave();
    // Open clean, then edit: one setState that switches the id AND marks it dirty
    // is a document switch to autosave, which schedules nothing.
    useEditorStore.setState({
      presentation: normalizePresentation(ROW),
      presentationId: 7,
      isDirty: false,
      requiresInitialSave: false,
    });
    useEditorStore.setState({
      presentation: normalizePresentation(withBody(ROW, 'Typed just now')),
      isDirty: true,
    });
    // The debounce has not elapsed: the change is scheduled, not written.
    expect(updatePresentation).not.toHaveBeenCalled();

    await openPresentationInEditor(7);

    expect(updatePresentation).toHaveBeenCalledTimes(1);
    expect(bodyOf(vi.mocked(updatePresentation).mock.calls[0]?.[1])).toBe('Typed just now');
    const writeOrder = vi.mocked(updatePresentation).mock.invocationCallOrder[0]!;
    const readOrder = vi.mocked(getPresentation).mock.invocationCallOrder[0]!;
    expect(writeOrder).toBeLessThan(readOrder);
    expect(bodyOf(useEditorStore.getState().presentation)).toBe('Typed just now');
  });

  it('writes nothing when there was nothing pending (control)', async () => {
    vi.useFakeTimers();
    stop = startAutosave();
    useEditorStore.setState({
      presentation: normalizePresentation(ROW),
      presentationId: 7,
      isDirty: false,
    });

    await openPresentationInEditor(7);

    expect(updatePresentation).not.toHaveBeenCalled();
  });
});
