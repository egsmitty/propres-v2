import { useEditorStore } from '@/store/editorStore';
import { alertDialog } from '@/utils/dialog';
import { updatePresentation } from '@/utils/ipc';
import {
  VERSION_EXEMPT_PRESENTATION_IDS,
  presentationContentKey,
} from '@/utils/presentationVersions';
import { AUTOSAVE_DEBOUNCE_MS, nextAutosaveDelayMs } from '@/utils/autosave';

/**
 * Autosave — the wiring (plan A5 slice 2).
 *
 * Subscribes to the editor store and writes the live document to its own row a
 * couple of seconds after each change. It deliberately does NOT clear
 * `isDirty`: under this design dirty means "the live row differs from the
 * newest restore point", so only Save (which appends a version) and Revert
 * (which moves the row back) may clear it.
 */

/** Consecutive failed writes before the user is told. */
export const AUTOSAVE_FAILURE_ALERT_THRESHOLD = 3;

type EditorState = ReturnType<typeof useEditorStore.getState>;

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export interface AutosaveDeps {
  store: typeof useEditorStore;
  updatePresentation: (
    id: number,
    data: Record<string, unknown>
  ) => Promise<Envelope<unknown> | null>;
  alertDialog: (message: string, options?: Record<string, unknown>) => Promise<unknown>;
  now: () => number;
}

function defaultDeps(): AutosaveDeps {
  return {
    store: useEditorStore,
    updatePresentation,
    alertDialog,
    now: () => Date.now(),
  } as AutosaveDeps;
}

interface Controller {
  cancel: () => void;
}

/**
 * The running autosave, so `resolveUnsavedChanges` and `revertToLatestVersion`
 * can cancel a pending write without holding a reference. `startAutosave`
 * REPLACES any controller already registered — React StrictMode mounts effects
 * twice in dev, and an orphaned timer would outlive the first mount.
 */
let active: Controller | null = null;

/** Cancel any scheduled write. A no-op when autosave is not running. */
export function cancelPendingAutosave(): void {
  active?.cancel();
}

export function startAutosave(deps: AutosaveDeps = defaultDeps()): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWriteAt: number | null = null;
  let lastWrittenKey: string | null = null;
  let failures = 0;
  let alerted = false;
  let stoppedForMissingRow = false;
  // Bumped by every cancel. A flush that started before a cancel checks this
  // before issuing its write, so a revert cannot be undone by a timer that had
  // already fired.
  let generation = 0;

  const cancel = () => {
    generation += 1;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  async function write(id: number, presentation: Record<string, unknown>): Promise<void> {
    const mine = generation;
    lastWriteAt = deps.now();
    const key = presentationContentKey(presentation);

    const result = await deps.updatePresentation(id, presentation);
    if (mine !== generation) return;

    if (!result?.success) {
      // Do NOT record the key: the content is still unwritten and must be
      // retried on the next change. Silent failure is the one thing autosave
      // may never do — the title bar would keep saying "Unsaved changes" while
      // the user believed their work was safe.
      failures += 1;
      if (failures >= AUTOSAVE_FAILURE_ALERT_THRESHOLD && !alerted) {
        alerted = true;
        await deps.alertDialog(
          `Your changes could not be saved automatically: ${result?.error || 'unknown error'}. Try File ▸ Save.`,
          { title: 'Could Not Save' }
        );
      }
      return;
    }

    if (result.data == null) {
      // The row is gone — deleted from Home while it was still open here.
      // Writing forever against a missing id helps nobody.
      stoppedForMissingRow = true;
      if (!alerted) {
        alerted = true;
        await deps.alertDialog(
          'This presentation no longer exists, so your changes are not being saved.',
          { title: 'Presentation Deleted' }
        );
      }
      return;
    }

    failures = 0;
    lastWrittenKey = key;
  }

  function flush(id: number, presentation: Record<string, unknown>): void {
    timer = null;
    void write(id, presentation);
  }

  // Takes only the id: the payload is re-read from the store at fire time, so
  // a snapshot captured at schedule time would be stale by the time it wrote.
  function schedule(id: number): void {
    if (stoppedForMissingRow) return;
    if (VERSION_EXEMPT_PRESENTATION_IDS.includes(id)) return;
    cancel();
    const mine = generation;
    const now = deps.now();
    const delay = nextAutosaveDelayMs({ now, lastChangeAt: now, lastWriteAt });
    timer = setTimeout(() => {
      if (mine !== generation) return;
      // Re-read at fire time: state can change between scheduling and firing.
      const state = deps.store.getState();
      if (!state.isDirty || !state.presentation || state.presentationId !== id) return;
      const current = state.presentation as Record<string, unknown>;
      if (presentationContentKey(current) === lastWrittenKey) return;
      flush(id, current);
    }, delay);
  }

  const unsubscribe = deps.store.subscribe((state: EditorState, prev: EditorState) => {
    if (state.presentationId !== prev.presentationId) {
      // Switching documents. FLUSH the old one rather than cancelling:
      // `file:open` navigates Home without resolving unsaved changes, so
      // cancelling would silently destroy up to AUTOSAVE_MAX_WAIT_MS of work.
      // Discard and Revert both call cancelPendingAutosave() first, so nothing
      // that was deliberately thrown away can be resurrected here.
      const previousId = prev.presentationId;
      const previous = prev.presentation as Record<string, unknown> | null;
      cancel();
      if (
        prev.isDirty &&
        previous &&
        typeof previousId === 'number' &&
        presentationContentKey(previous) !== lastWrittenKey
      ) {
        void write(previousId, previous);
      }
      lastWriteAt = null;
      lastWrittenKey = null;
      failures = 0;
      alerted = false;
      stoppedForMissingRow = false;
      return;
    }

    if (prev.isDirty && !state.isDirty) {
      // Saved or reverted: whatever needed writing has been written.
      cancel();
      return;
    }

    // The disjunction matters. `insertNewSlideIntoCurrentPresentation` and
    // `TitleBar.commitRename` call setPresentation (isDirty false) and THEN
    // setDirty(true), so the two halves arrive in SEPARATE notifications and a
    // plain `changed && dirty` conjunction never fires for either.
    if (
      state.isDirty &&
      state.presentation &&
      typeof state.presentationId === 'number' &&
      (!prev.isDirty || state.presentation !== prev.presentation)
    ) {
      schedule(state.presentationId);
    }
  });

  const controller: Controller = { cancel };
  active = controller;

  return () => {
    cancel();
    unsubscribe();
    if (active === controller) active = null;
  };
}

export { AUTOSAVE_DEBOUNCE_MS };
