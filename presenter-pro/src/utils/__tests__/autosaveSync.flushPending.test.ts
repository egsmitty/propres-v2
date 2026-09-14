import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/ipc', () => ({
  updatePresentation: vi.fn(),
  writeVersion: vi.fn(),
  getLatestVersion: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));

import { updatePresentation } from '@/utils/ipc';
import { useEditorStore } from '@/store/editorStore';
import { AUTOSAVE_DEBOUNCE_MS } from '@/utils/autosave';
import { cancelPendingAutosave, flushPendingAutosave, startAutosave } from '@/utils/autosaveSync';

// Plan S2 (audit SAVE-A4). Opening a presentation reads its row from the
// database. If autosave still has a change scheduled — or a write on its way —
// that read returns the older row, loading it into the editor cancels the
// schedule, and up to AUTOSAVE_MAX_WAIT_MS of typing is gone. The opener now
// awaits `flushPendingAutosave()` first. These cases pin the flush itself; the
// open path is pinned in presentationCommands.saveRaces.test.ts.
//
// On the code before this plan `flushPendingAutosave` does not exist, so these
// cases fail with "is not a function" rather than on an assertion; the
// assertion-level red for SAVE-A4 is the open-path case in the other file.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

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
    sections: [{ ...PRESENTATION.sections[0]!, slides: [{ id: 's1', body }] }],
  };
}

/**
 * Open the presentation clean, then edit it — the way the editor becomes dirty.
 * One setState that switches the id AND marks it dirty is a document switch to
 * the subscription, which schedules nothing.
 */
function editDirty(body: string) {
  useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: false });
  useEditorStore.setState({ presentation: edited(body), isDirty: true });
}

function writtenBody(call: unknown[] | undefined): string {
  const data = call?.[1] as { sections?: Array<{ slides?: Array<{ body?: string }> }> } | undefined;
  return String(data?.sections?.[0]?.slides?.[0]?.body ?? '');
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

describe('flushPendingAutosave (SAVE-A4)', () => {
  it('writes a scheduled change now instead of waiting for the timer', async () => {
    stop = startAutosave();
    editDirty('Typed just now');

    await flushPendingAutosave();

    expect(updatePresentation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updatePresentation).mock.calls[0]?.[0]).toBe(7);
    expect(writtenBody(vi.mocked(updatePresentation).mock.calls[0])).toBe('Typed just now');
  });

  it('does not write the same change twice when the timer would have fired later', async () => {
    stop = startAutosave();
    editDirty('Typed just now');

    await flushPendingAutosave();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 10);

    expect(updatePresentation).toHaveBeenCalledTimes(1);
  });

  it('waits for a write that is already on its way', async () => {
    const inFlight = deferred<{ success: boolean; data: unknown }>();
    vi.mocked(updatePresentation).mockReturnValueOnce(
      inFlight.promise as ReturnType<typeof updatePresentation>
    );
    stop = startAutosave();
    editDirty('Typed just now');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 50);
    expect(updatePresentation).toHaveBeenCalledTimes(1);

    let flushed = false;
    const flushing = flushPendingAutosave().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);

    inFlight.resolve({ success: true, data: edited('Typed just now') });
    await flushing;

    expect(flushed).toBe(true);
    expect(updatePresentation).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when nothing is pending', async () => {
    stop = startAutosave();
    useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: false });

    await flushPendingAutosave();

    expect(updatePresentation).not.toHaveBeenCalled();
  });

  it('never brings back a change that was cancelled (Discard, Revert)', async () => {
    stop = startAutosave();
    editDirty('Thrown away');
    cancelPendingAutosave();

    await flushPendingAutosave();

    expect(updatePresentation).not.toHaveBeenCalled();
  });

  it('resolves without writing when autosave is not running', async () => {
    editDirty('Typed just now');

    await flushPendingAutosave();

    expect(updatePresentation).not.toHaveBeenCalled();
  });
});
