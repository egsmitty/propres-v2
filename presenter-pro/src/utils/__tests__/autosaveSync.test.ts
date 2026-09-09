import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/ipc', () => ({
  updatePresentation: vi.fn(),
  writeVersion: vi.fn(),
  getLatestVersion: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));

import { updatePresentation, writeVersion } from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import { AUTOSAVE_DEBOUNCE_MS } from '@/utils/autosave';
import { cancelPendingAutosave, startAutosave } from '@/utils/autosaveSync';

// Plan A5 slice 2. Autosave writes the live row continuously and NEVER clears
// isDirty — that is the whole design, and case "leaves isDirty true" is the
// load-bearing assertion.

const INITIAL_STATE = useEditorStore.getState();

const PRESENTATION = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Hi' }] },
  ],
  aspectRatio: '16:9',
};

function edited(body: string) {
  return {
    ...PRESENTATION,
    sections: [
      {
        ...PRESENTATION.sections[0]!,
        slides: [{ id: 's1', body }],
      },
    ],
  };
}

let stop: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: PRESENTATION });
});

afterEach(() => {
  stop?.();
  stop = null;
  cancelPendingAutosave();
  vi.useRealTimers();
});

async function settle(ms = AUTOSAVE_DEBOUNCE_MS + 50) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('startAutosave', () => {
  it('writes nothing while the document is clean', async () => {
    stop = startAutosave();
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: false });
    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(0);
  });

  it('writes the live row once the debounce elapses, with the exact arguments', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });

    expect(updatePresentation).toHaveBeenCalledTimes(0);
    await settle();
    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, edited('changed')]]);
  });

  it('schedules when setPresentation and setDirty arrive as SEPARATE notifications', async () => {
    // insertNewSlideIntoCurrentPresentation and TitleBar.commitRename both call
    // setPresentation (which sets isDirty false) and THEN setDirty(true), so the
    // subscriber sees two notifications and neither has both halves at once. A
    // naive `presentation changed && isDirty` condition never fires for either.
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();

    useEditorStore.getState().setPresentation(edited('inserted'));
    useEditorStore.getState().setDirty(true);

    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid changes into exactly one write', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();

    for (const body of ['a', 'ab', 'abc', 'abcd']) {
      useEditorStore.setState({ presentation: edited(body), isDirty: true });
      await vi.advanceTimersByTimeAsync(100);
    }
    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(1);
  });

  it('leaves isDirty true after a write — autosave is not a save', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });
    await settle();

    expect(updatePresentation).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('never touches the editor store — no selection reset, no cleared history', async () => {
    useEditorStore.setState({
      presentation: PRESENTATION,
      presentationId: 7,
      selectedSlideId: 's1',
      selectedSectionId: 'sec-1',
    });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });
    await settle();

    // Routing autosave through loadPresentationIntoEditor would yank the cursor
    // to slide 1 and clear undo history every two seconds.
    expect(useEditorStore.getState().selectedSlideId).toBe('s1');
    expect(useEditorStore.getState().presentation).toEqual(edited('changed'));
  });

  it('never appends a version — versions are deliberate acts only', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });
    await settle();
    expect(writeVersion).toHaveBeenCalledTimes(0);
  });

  it('skips the write when the content key is unchanged', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();

    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });
    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(1);

    // A new object with identical content — normalization churn, not an edit.
    useEditorStore.setState({ presentation: { ...edited('changed') }, isDirty: true });
    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(1);
  });

  it('flushes the previous document when the presentation changes', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('unsaved work'), isDirty: true });

    // Switching away before the debounce elapses: `file:open` navigates Home
    // without resolving unsaved changes, so cancelling here would silently
    // destroy up to AUTOSAVE_MAX_WAIT_MS of edits.
    useEditorStore.setState({ presentation: { id: 9, sections: [] }, presentationId: 9 });
    await settle();

    expect(vi.mocked(updatePresentation).mock.calls).toEqual([[7, edited('unsaved work')]]);
  });

  it('cancels the pending write when the document becomes clean', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });
    useEditorStore.setState({ isDirty: false });
    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(0);
  });

  it('cancelPendingAutosave stops a scheduled write from landing', async () => {
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();
    useEditorStore.setState({ presentation: edited('changed'), isDirty: true });

    cancelPendingAutosave();
    await settle();
    expect(updatePresentation).toHaveBeenCalledTimes(0);
  });

  it('retries after a failed write and alerts once it keeps failing', async () => {
    vi.mocked(updatePresentation).mockResolvedValue({ success: false, error: 'db locked' });
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();

    for (const body of ['a', 'ab', 'abc']) {
      useEditorStore.setState({ presentation: edited(body), isDirty: true });
      await settle();
    }

    // Silent failure is the one thing autosave must never do: the pill would
    // read "unsaved" while the user believes their work is safe.
    expect(updatePresentation).toHaveBeenCalledTimes(3);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });

  it('stops autosaving when the row has been deleted underneath it', async () => {
    vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: null });
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
    stop = startAutosave();

    useEditorStore.setState({ presentation: edited('a'), isDirty: true });
    await settle();
    useEditorStore.setState({ presentation: edited('ab'), isDirty: true });
    await settle();

    // getPresentation returns null for a missing id, so the envelope succeeds
    // with no data. Writing forever against a deleted row helps nobody.
    expect(updatePresentation).toHaveBeenCalledTimes(1);
    expect(alertDialog).toHaveBeenCalledTimes(1);
  });
});
