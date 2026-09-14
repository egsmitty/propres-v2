/**
 * Editors whose unsaved work lives outside the editor store (plan D3, audit
 * SAVE-A1). The song editor keeps its edits in modal state, so quitting or
 * leaving the presentation used to drop them without a word. Such editors
 * register here while they are open; quit, Close, New and Open ask each dirty
 * one to resolve (Save / Discard) before doing anything else.
 */

export interface BlockingEditorHandlers {
  /** True while the editor holds edits that would be lost. */
  isDirty: () => boolean;
  /** Ask the user; resolve true when it is safe to proceed (saved or discarded). */
  resolve: () => Promise<boolean>;
}

const editors = new Map<string, BlockingEditorHandlers>();

/** Registers `handlers` under `id`; the returned function unregisters them. */
export function registerBlockingEditor(id: string, handlers: BlockingEditorHandlers): () => void {
  editors.set(id, handlers);
  return () => {
    // A remount may already have registered newer handlers under the same id.
    if (editors.get(id) === handlers) editors.delete(id);
  };
}

/** Asks every dirty editor in turn; false as soon as one declines (or throws). */
export async function resolveBlockingEditors(): Promise<boolean> {
  for (const handlers of [...editors.values()]) {
    if (!handlers.isDirty()) continue;
    try {
      if (!(await handlers.resolve())) return false;
    } catch (error) {
      console.error('An open editor could not resolve its unsaved changes', error);
      return false;
    }
  }
  return true;
}
