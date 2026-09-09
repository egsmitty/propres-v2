import { useEditorStore } from '@/store/editorStore';
import { deleteJournal, getPresentations, listJournals } from '@/utils/ipc';
import { showDialog } from '@/utils/dialog';
import { loadPresentationIntoEditor } from '@/utils/presentationCommands';
import { selectRecoverable, type JournalRow, type PresentationRow } from '@/utils/recoveryJournal';

/**
 * Crash-recovery journal — the wiring.
 *
 * NOTHING WRITES JOURNALS ANY MORE (plan A5 slice 3). Autosave puts edits into
 * the real record within seconds, so a shadow copy is redundant — and would be
 * broken anyway, since every autosave bumps `presentations.updated_at` and
 * `selectRecoverable` would then call every row stale before reading it.
 *
 * `offerRecoveryOnStartup` remains to drain journals written by a pre-autosave
 * build. Once no profile has any rows left, this module and the
 * `presentation_journal` table can go. Every collaborator is injectable so the
 * unit tests use fakes; the defaults wire the real modules. Main window only.
 */

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
  deleteJournal: (presentationId: number) => Promise<unknown>;
  listJournals: () => Promise<Envelope<JournalRow[]> | null | undefined>;
  getPresentations: () => Promise<Envelope<PresentationRow[]> | null | undefined>;
  showDialog: (config: {
    title: string;
    description: string;
    actions: DialogAction[];
  }) => Promise<{ action?: string } | null | undefined>;
  loadPresentationIntoEditor: (presentation: unknown) => void;
}

function defaultDeps(): SyncDeps {
  return {
    store: useEditorStore,
    deleteJournal,
    listJournals,
    getPresentations,
    showDialog,
    loadPresentationIntoEditor,
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
