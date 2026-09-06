import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEditorStore } from '@/store/editorStore';
import {
  startRecoveryJournalSync,
  offerRecoveryOnStartup,
  JOURNAL_EXEMPT_PRESENTATION_IDS,
  type SyncDeps,
} from '@/utils/recoveryJournalSync';
import { JOURNAL_DEBOUNCE_MS } from '@/utils/recoveryJournal';

// The wiring between the editor store and the journal. Timers are faked and
// every collaborator is injected, so nothing here touches IPC or a dialog.

const INITIAL_STATE = useEditorStore.getState();

const presentationFixture = () => ({
  id: 41,
  title: 'Sunday Morning',
  updated_at: 1_700_000_000,
  aspectRatio: '16:9',
  sections: [
    { id: 'sec-1', type: 'song', backgroundId: null, slides: [{ id: 'sl-1', body: 'a' }] },
  ],
});

function makeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps & {
  writeJournal: ReturnType<typeof vi.fn>;
  deleteJournal: ReturnType<typeof vi.fn>;
  listJournals: ReturnType<typeof vi.fn>;
  getPresentations: ReturnType<typeof vi.fn>;
  showDialog: ReturnType<typeof vi.fn>;
  loadPresentationIntoEditor: ReturnType<typeof vi.fn>;
} {
  const deps = {
    store: useEditorStore,
    writeJournal: vi.fn(async () => ({ success: true, data: { presentationId: 41 } })),
    deleteJournal: vi.fn(async () => ({ success: true, data: { presentationId: 41 } })),
    listJournals: vi.fn(async () => ({ success: true, data: [] })),
    getPresentations: vi.fn(async () => ({ success: true, data: [] })),
    showDialog: vi.fn(async () => null),
    loadPresentationIntoEditor: vi.fn(),
    now: () => Date.now(),
    ...overrides,
  };
  return deps as never;
}

let stop: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  useEditorStore.setState(INITIAL_STATE, true);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

describe('startRecoveryJournalSync', () => {
  it('writes nothing while the store is clean', async () => {
    const deps = makeDeps();
    stop = startRecoveryJournalSync(deps);
    useEditorStore.getState().setPresentation(presentationFixture());

    await vi.advanceTimersByTimeAsync(JOURNAL_DEBOUNCE_MS * 5);
    expect(deps.writeJournal).not.toHaveBeenCalled();
  });

  it('writes exactly one journal after the debounce, with the exact payload', async () => {
    const deps = makeDeps();
    stop = startRecoveryJournalSync(deps);
    useEditorStore.getState().setPresentation(presentationFixture());
    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edited');

    await vi.advanceTimersByTimeAsync(JOURNAL_DEBOUNCE_MS - 1);
    expect(deps.writeJournal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(deps.writeJournal).toHaveBeenCalledTimes(1);
    expect(deps.writeJournal).toHaveBeenCalledWith({
      presentationId: 41,
      snapshot: JSON.stringify(useEditorStore.getState().presentation),
      baseUpdatedAt: 1_700_000_000,
    });
  });

  it('coalesces rapid changes into a single write', async () => {
    const deps = makeDeps();
    stop = startRecoveryJournalSync(deps);
    useEditorStore.getState().setPresentation(presentationFixture());

    for (const body of ['a', 'ab', 'abc']) {
      useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', body);
      await vi.advanceTimersByTimeAsync(500);
    }
    await vi.advanceTimersByTimeAsync(JOURNAL_DEBOUNCE_MS);

    expect(deps.writeJournal).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending write and deletes the journal when the document becomes clean', async () => {
    const deps = makeDeps();
    stop = startRecoveryJournalSync(deps);
    useEditorStore.getState().setPresentation(presentationFixture());
    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edited');
    await vi.advanceTimersByTimeAsync(500);

    useEditorStore.getState().setDirty(false); // save or discard

    await vi.advanceTimersByTimeAsync(JOURNAL_DEBOUNCE_MS * 5);
    expect(deps.writeJournal).not.toHaveBeenCalled();
    expect(deps.deleteJournal).toHaveBeenCalledTimes(1);
    expect(deps.deleteJournal).toHaveBeenCalledWith(41);
  });
});

describe('offerRecoveryOnStartup', () => {
  const row = (presentation_id: number, base_updated_at: number) => ({
    presentation_id,
    saved_at: 5,
    base_updated_at,
    snapshot: JSON.stringify({ ...presentationFixture(), id: presentation_id }),
  });

  it('deletes stale journals without prompting', async () => {
    const deps = makeDeps({
      listJournals: vi.fn(async () => ({ success: true, data: [row(9, 100), row(41, 1)] })),
      getPresentations: vi.fn(async () => ({
        success: true,
        data: [{ id: 41, title: 'Sunday Morning', updated_at: 1_700_000_000 }],
      })),
    });
    await offerRecoveryOnStartup(deps);

    // Both stale: 9 has no presentation, 41's base predates the current save.
    expect(deps.deleteJournal.mock.calls.map((c) => c[0])).toEqual([9, 41]);
    expect(deps.showDialog).not.toHaveBeenCalled();
    expect(deps.loadPresentationIntoEditor).not.toHaveBeenCalled();
  });

  it('offers exactly Later / Discard / Recover and honours each choice', async () => {
    const presentations = [{ id: 41, title: 'Sunday Morning', updated_at: 1_700_000_000 }];
    const runWith = async (choice: 'later' | 'discard' | 'recover') => {
      const deps = makeDeps({
        listJournals: vi.fn(async () => ({ success: true, data: [row(41, 1_700_000_000)] })),
        getPresentations: vi.fn(async () => ({ success: true, data: presentations })),
        showDialog: vi.fn(async () => ({ action: choice, values: {} })),
      });
      await offerRecoveryOnStartup(deps);
      return deps;
    };

    const later = await runWith('later');
    const dialogConfig = later.showDialog.mock.calls[0]?.[0] as {
      title: string;
      actions: Array<{ label: string; value: string; primary?: boolean; cancel?: boolean }>;
    };
    expect(dialogConfig.title).toBe('Recover Unsaved Work');
    // Exact, ordered. Later is the cancel (Escape) action so Escape never discards.
    expect(dialogConfig.actions.map((a) => a.label)).toEqual(['Later', 'Discard', 'Recover']);
    expect(dialogConfig.actions.find((a) => a.cancel)?.value).toBe('later');
    expect(dialogConfig.actions.find((a) => a.primary)?.value).toBe('recover');
    expect(later.deleteJournal).not.toHaveBeenCalled();
    expect(later.loadPresentationIntoEditor).not.toHaveBeenCalled();

    const discard = await runWith('discard');
    expect(discard.deleteJournal).toHaveBeenCalledWith(41);
    expect(discard.loadPresentationIntoEditor).not.toHaveBeenCalled();

    const recover = await runWith('recover');
    expect(recover.loadPresentationIntoEditor).toHaveBeenCalledTimes(1);
    expect(recover.loadPresentationIntoEditor.mock.calls[0]?.[0]).toEqual(
      JSON.parse(row(41, 1_700_000_000).snapshot)
    );
    // Recovered work is unsaved work: dirty, not awaiting an initial save, and
    // the journal is KEPT so a second crash is still recoverable.
    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(useEditorStore.getState().requiresInitialSave).toBe(false);
    expect(recover.deleteJournal).not.toHaveBeenCalled();
  });
});

describe('escape hatch', () => {
  it('has no exempt presentation ids', () => {
    expect(JOURNAL_EXEMPT_PRESENTATION_IDS).toEqual([]);
  });
});
