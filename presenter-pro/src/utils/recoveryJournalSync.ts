import { useEditorStore } from '@/store/editorStore';
import { deleteJournal, getPresentations, listJournals, writeJournal } from '@/utils/ipc';
import { showDialog } from '@/utils/dialog';
import { loadPresentationIntoEditor } from '@/utils/presentationCommands';
import {
  nextWriteDelayMs,
  selectRecoverable,
  type JournalRow,
  type PresentationRow,
} from '@/utils/recoveryJournal';

/**
 * Crash-recovery journal — the wiring.
 *
 * `startRecoveryJournalSync` subscribes to the editor store and journals the
 * in-memory presentation while it is dirty. `offerRecoveryOnStartup` checks
 * for journals on launch and asks the user what to do with each recoverable
 * one. Every collaborator is injectable so the unit tests use fakes; the
 * defaults wire the real modules. Runs in the main window only (see App.jsx).
 *
 * Save keeps its meaning: nothing here writes to the `presentations` table.
 */

/**
 * Presentation ids never journaled. Every entry REQUIRES a justifying comment
 * and must be reported. Do not add entries to make something pass.
 */
export const JOURNAL_EXEMPT_PRESENTATION_IDS: ReadonlyArray<number> = [];

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface DialogAction {
  label: string;
  value: string;
  primary?: boolean;
  cancel?: boolean;
  variant?: string;
}

export interface SyncDeps {
  store: typeof useEditorStore;
  writeJournal: (data: {
    presentationId: number;
    snapshot: string;
    baseUpdatedAt: number | null;
  }) => Promise<unknown>;
  deleteJournal: (presentationId: number) => Promise<unknown>;
  listJournals: () => Promise<Envelope<JournalRow[]> | null | undefined>;
  getPresentations: () => Promise<Envelope<PresentationRow[]> | null | undefined>;
  showDialog: (config: {
    title: string;
    description: string;
    actions: DialogAction[];
  }) => Promise<{ action?: string } | null | undefined>;
  loadPresentationIntoEditor: (presentation: unknown) => void;
  now: () => number;
}

function defaultDeps(): SyncDeps {
  return {
    store: useEditorStore,
    writeJournal,
    deleteJournal,
    listJournals,
    getPresentations,
    showDialog,
    loadPresentationIntoEditor,
    now: () => Date.now(),
  };
}

type EditorState = ReturnType<typeof useEditorStore.getState>;

function baseUpdatedAtOf(presentation: unknown): number | null {
  const value = (presentation as { updated_at?: unknown } | null)?.updated_at;
  return typeof value === 'number' ? value : null;
}

/**
 * Journal the presentation while it is dirty. Returns a stop function that
 * cancels any pending write and unsubscribes.
 */
export function startRecoveryJournalSync(deps: SyncDeps = defaultDeps()): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWriteAt: number | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = async () => {
    timer = null;
    const state = deps.store.getState();
    const id = state.presentationId;
    if (!state.isDirty || !state.presentation || id === null || id === undefined) return;
    if (JOURNAL_EXEMPT_PRESENTATION_IDS.includes(id)) return;
    lastWriteAt = deps.now();
    await deps.writeJournal({
      presentationId: id,
      snapshot: JSON.stringify(state.presentation),
      baseUpdatedAt: baseUpdatedAtOf(state.presentation),
    });
  };

  const schedule = () => {
    cancel();
    const now = deps.now();
    const delay = nextWriteDelayMs({ now, lastChangeAt: now, lastWriteAt });
    timer = setTimeout(() => {
      void flush();
    }, delay);
  };

  const unsubscribe = deps.store.subscribe((state: EditorState, prev: EditorState) => {
    if (state.presentationId !== prev.presentationId) {
      // A different document: any pending write belonged to the old one.
      cancel();
      lastWriteAt = null;
    }

    if (prev.isDirty && !state.isDirty) {
      // Saved or discarded: the journal is no longer needed either way.
      cancel();
      const id = prev.presentationId;
      if (id !== null && id !== undefined) void deps.deleteJournal(id);
      return;
    }

    if (
      state.isDirty &&
      state.presentation &&
      (!prev.isDirty || state.presentation !== prev.presentation)
    ) {
      schedule();
    }
  });

  return () => {
    cancel();
    unsubscribe();
  };
}

/**
 * On launch: delete stale journals silently and offer each recoverable one.
 *
 * Actions are `Later` / `Discard` / `Recover`, with Later as the Escape
 * action so a reflexive Escape never destroys unsaved work. Recovered work is
 * loaded as UNSAVED (dirty) and its journal is kept until the user saves, so a
 * second crash is still recoverable.
 */
export async function offerRecoveryOnStartup(deps: SyncDeps = defaultDeps()): Promise<void> {
  const [journalsResult, presentationsResult] = await Promise.all([
    deps.listJournals(),
    deps.getPresentations(),
  ]);
  if (!journalsResult?.success || !presentationsResult?.success) return;

  const { recoverable, stale } = selectRecoverable(
    journalsResult.data ?? [],
    presentationsResult.data ?? []
  );

  for (const { journal } of stale) {
    await deps.deleteJournal(journal.presentation_id);
  }

  for (const { journal, presentation } of recoverable) {
    const result = await deps.showDialog({
      title: 'Recover Unsaved Work',
      description: `Unsaved changes to "${presentation.title}" were found from a previous session. Recover them now?`,
      actions: [
        { label: 'Later', value: 'later', cancel: true },
        { label: 'Discard', value: 'discard', variant: 'danger' },
        { label: 'Recover', value: 'recover', primary: true },
      ],
    });

    const action = result?.action;
    if (action === 'recover') {
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(journal.snapshot);
      } catch {
        // Unreadable journal: nothing can be recovered from it, so drop it
        // rather than offer it again forever.
        await deps.deleteJournal(journal.presentation_id);
        continue;
      }
      deps.loadPresentationIntoEditor(snapshot);
      const store = deps.store.getState();
      store.setDirty(true);
      store.setRequiresInitialSave(false);
    } else if (action === 'discard') {
      await deps.deleteJournal(journal.presentation_id);
    }
    // 'later' (or Escape): keep the journal, ask again next launch.
  }
}
