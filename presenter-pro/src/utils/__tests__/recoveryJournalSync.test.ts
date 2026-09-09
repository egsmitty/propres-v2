import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEditorStore } from '@/store/editorStore';
import { offerRecoveryOnStartup, type SyncDeps } from '@/utils/recoveryJournalSync';

// The startup drain for journals left by a pre-autosave build. The writer was
// removed in plan A5 slice 3 — autosave puts edits in the real record — so the
// cases that covered it went with it. Every collaborator is injected, so
// nothing here touches IPC or a dialog.

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
  deleteJournal: ReturnType<typeof vi.fn>;
  listJournals: ReturnType<typeof vi.fn>;
  getPresentations: ReturnType<typeof vi.fn>;
  showDialog: ReturnType<typeof vi.fn>;
  loadPresentationIntoEditor: ReturnType<typeof vi.fn>;
} {
  const deps = {
    store: useEditorStore,
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
