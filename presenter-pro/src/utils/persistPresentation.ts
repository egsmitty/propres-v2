/**
 * Plan SAVED1 (audit SAVE-D1) — the one writer for a `presentations` row.
 *
 * Six call sites (Save, the Unsaved Changes gate, Rename from Home, autosave,
 * Restore and Revert) each applied their own subset of the same rules. The
 * mechanics live here, once:
 *   - a rejected IPC call is a failure like any other, never an unhandled
 *     rejection (plan D1, audit SAVE-A11) — before this, only autosave caught it;
 *   - a failed envelope is `failed`, carrying the envelope's error **verbatim**
 *     (possibly none) so every caller keeps its own fallback message;
 *   - a success with no row means the presentation was deleted while it was
 *     open (audit SAVE-A6/A7) — `missing`, never "saved";
 *   - the written row comes back normalized, once;
 *   - `commit` is the capture function to run on the normalized row (plan D1,
 *     audit SAVE-A9): the caller sees whether its restore point was recorded.
 *
 * What stays with the callers, on purpose: their dialogs (the exact messages
 * users see) and their store effects (Save's "keep the newer edit" rule,
 * autosave's failure counting, Restore's document swap). Those are policies,
 * not mechanics. This module imports nothing from the version or autosave
 * modules — the capture function is passed in — so it closes no import cycle.
 */

import { normalizePresentation } from '@/utils/backgrounds';
import { updatePresentation } from '@/utils/ipc';

type Presentation = Record<string, unknown>;

interface Envelope<T> {
  success?: boolean;
  data?: T | null;
  error?: string;
}

export interface PersistDeps {
  updatePresentation: (id: number, data: Presentation) => Promise<Envelope<Presentation> | null>;
}

export type PersistOutcome =
  | { ok: true; presentation: Presentation; committed: boolean }
  | { ok: false; reason: 'failed' | 'missing'; error?: string };

export interface PersistOptions {
  /** Records a restore point for the written row; its result is `committed`. */
  commit?: (presentation: Presentation) => Promise<boolean>;
  deps?: PersistDeps;
}

/** The message every caller shows for `missing` today; exported so none re-spells it. */
export const PERSIST_MISSING_MESSAGE =
  'This presentation no longer exists, so it could not be saved.';

function defaultDeps(): PersistDeps {
  return { updatePresentation: updatePresentation as PersistDeps['updatePresentation'] };
}

export async function persistPresentation(
  id: number,
  document: Presentation,
  { commit, deps = defaultDeps() }: PersistOptions = {}
): Promise<PersistOutcome> {
  let result: Envelope<Presentation> | null;
  try {
    result = await deps.updatePresentation(id, document);
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!result?.success) {
    return result?.error
      ? { ok: false, reason: 'failed', error: result.error }
      : { ok: false, reason: 'failed' };
  }
  if (result.data == null) {
    return { ok: false, reason: 'missing' };
  }

  const presentation = normalizePresentation(result.data) as Presentation;
  const committed = commit ? await commit(presentation) : false;
  return { ok: true, presentation, committed };
}
