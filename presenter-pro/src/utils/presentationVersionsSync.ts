import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { normalizePresentation } from '@/utils/backgrounds';
import { alertDialog } from '@/utils/dialog';
import { getLatestVersion, getVersion, updatePresentation, writeVersion } from '@/utils/ipc';
import {
  VERSION_EXEMPT_PRESENTATION_IDS,
  hasDiverged,
  presentationContentKey,
} from '@/utils/presentationVersions';
import { cancelPendingAutosave } from '@/utils/autosaveSync';

/**
 * Restore-point wiring (plan A5).
 *
 * `captureVersion` records a deliberate save; `ensureVersion` gives a
 * presentation its first restore point; `revertToLatestVersion` puts the live
 * row back to the newest one.
 *
 * This module deliberately does NOT import `loadPresentationIntoEditor` from
 * `presentationCommands.js` — that module imports this one, and the cycle would
 * be real. It also needs a no-navigate mode, which that helper cannot offer.
 * The store update below is therefore written out.
 */

type Presentation = Record<string, unknown>;

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface VersionRow {
  id: number;
  presentation_id: number;
  snapshot: string;
  saved_at: number;
}

export interface VersionDeps {
  writeVersion: (data: {
    presentationId: number;
    snapshot: string;
  }) => Promise<Envelope<unknown> | null>;
  getVersion: (versionId: number) => Promise<Envelope<VersionRow | null> | null>;
  getLatestVersion: (presentationId: number) => Promise<Envelope<VersionRow | null> | null>;
  updatePresentation: (id: number, data: Presentation) => Promise<Envelope<Presentation> | null>;
  alertDialog: (message: string, options?: Record<string, unknown>) => Promise<unknown>;
  store: typeof useEditorStore;
  appStore: typeof useAppStore;
}

function defaultDeps(): VersionDeps {
  return {
    writeVersion,
    getVersion,
    getLatestVersion,
    updatePresentation,
    alertDialog,
    store: useEditorStore,
    appStore: useAppStore,
  } as VersionDeps;
}

function idOf(presentation: unknown): number | null {
  const value = (presentation as { id?: unknown } | null)?.id;
  return typeof value === 'number' ? value : null;
}

async function latestRow(id: number, deps: VersionDeps): Promise<VersionRow | null> {
  const result = await deps.getLatestVersion(id);
  if (!result?.success) return null;
  return result.data ?? null;
}

/** The newest version's snapshot JSON, or null when there is none. */
export async function readLatestSnapshot(
  id: number,
  deps: VersionDeps = defaultDeps()
): Promise<string | null> {
  const row = await latestRow(id, deps);
  return row?.snapshot ?? null;
}

/**
 * Record a deliberate save as a restore point.
 *
 * Content-key idempotent: a save that changes nothing appends nothing. That is
 * load-bearing, not an optimisation — `saveCurrentPresentation` runs regardless
 * of `isDirty`, so 25 reflexive Cmd-S presses would otherwise prune away every
 * genuine restore point and leave the list worse than a single row.
 */
export async function captureVersion(
  presentation: unknown,
  deps: VersionDeps = defaultDeps()
): Promise<boolean> {
  const id = idOf(presentation);
  if (id === null || VERSION_EXEMPT_PRESENTATION_IDS.includes(id)) return true;

  const snapshot = JSON.stringify(presentation);
  const newest = await latestRow(id, deps);
  // Nothing to record is a success: the restore point the caller wants already
  // exists and is identical.
  if (newest && !hasDiverged(presentation, newest.snapshot)) return true;

  // The result is INSPECTED, not discarded. Restore and revert stake their one
  // guarantee on this write having happened; a silent failure here would let
  // the document be overwritten with no restore point and nothing said.
  const result = await deps.writeVersion({ presentationId: id, snapshot });
  return result?.success !== false;
}

/** Give a presentation its first restore point, if it has none. */
export async function ensureVersion(
  presentation: unknown,
  deps: VersionDeps = defaultDeps()
): Promise<void> {
  const id = idOf(presentation);
  if (id === null || VERSION_EXEMPT_PRESENTATION_IDS.includes(id)) return;
  if (await latestRow(id, deps)) return;
  await deps.writeVersion({ presentationId: id, snapshot: JSON.stringify(presentation) });
}

/**
 * Put the document back to a SPECIFIC version, and keep the current state
 * reachable (plan A6).
 *
 * The closing `captureVersion` is not optional: without it the newest version
 * is the pre-restore state while the row holds the restored content, which
 * breaks the invariant dirty-on-open and Revert to Last Save both depend on.
 */
export async function restoreVersion(
  versionId: number,
  deps: VersionDeps = defaultDeps()
): Promise<boolean> {
  // First, before any await — every step below yields, and a debounced autosave
  // firing mid-restore would write the restored-away edits straight back.
  cancelPendingAutosave();

  const fetched = await deps.getVersion(versionId);
  const row = fetched?.success ? (fetched.data ?? null) : null;
  if (!row) {
    await deps.alertDialog('That version could not be found.', { title: 'Restore Failed' });
    return false;
  }

  const state = deps.store.getState();
  // The channel is not scoped by presentation, so a stale id — a history panel
  // left open across a File > Open — would write one document over another.
  if (row.presentation_id !== state.presentationId) {
    await deps.alertDialog('That version belongs to a different presentation.', {
      title: 'Restore Failed',
    });
    return false;
  }

  const snapshot = parseSnapshot(row.snapshot);
  if (!snapshot) {
    await deps.alertDialog('That version could not be read.', { title: 'Restore Failed' });
    return false;
  }

  // Preserve what is on screen BEFORE overwriting it. If this fails, stop:
  // "restoring is undoable" is the promise, and proceeding would break it
  // silently at the only moment it matters.
  if (!(await captureVersion(state.presentation, deps))) {
    await deps.alertDialog('Your current version could not be saved, so nothing was restored.', {
      title: 'Restore Failed',
    });
    return false;
  }

  const result = await deps.updatePresentation(row.presentation_id, snapshot);
  if (!result?.success || !result.data) {
    await deps.alertDialog(result?.error || 'Failed to restore that version.', {
      title: 'Restore Failed',
    });
    return false;
  }

  const normalized = normalizePresentation(result.data);
  applyRestored(normalized, deps, true);
  // THE INVARIANT: the newest version must equal the document again.
  await captureVersion(normalized, deps);
  return true;
}

/**
 * Put the live row back to the newest version and load it into the editor.
 *
 * Every failure path returns `false` having changed nothing, and says so — a
 * destructive-sounding confirmation that silently no-ops is worse than an
 * error. `navigate: false` is for the Unsaved Changes dialog, whose callers are
 * all *leaving* the editor and must not be dragged back to it.
 */
export async function revertToLatestVersion(
  id: number,
  options: { navigate?: boolean; capture?: boolean } = {},
  deps: VersionDeps = defaultDeps()
): Promise<boolean> {
  // `capture: false` is Discard. Discard means "this never happened", so the
  // work being thrown away must NOT be appended to the history list beside real
  // saves — and the retention rule that never drops the newest would pin it
  // there permanently.
  const { navigate = true, capture = true } = options;

  // FIRST, before any await. Every step below yields, and a debounced autosave
  // firing mid-revert would issue its write after this one and leave the
  // reverted-away edits in the row while the editor showed the reverted
  // document and the pill read "Saved".
  cancelPendingAutosave();

  const row = await latestRow(id, deps);
  if (!row) {
    await deps.alertDialog('There is no saved version to revert to.', {
      title: 'Nothing to Revert',
    });
    return false;
  }

  const snapshot = parseSnapshot(row.snapshot);
  if (!snapshot) {
    await deps.alertDialog('The last saved version could not be read.', { title: 'Revert Failed' });
    return false;
  }

  // Preserve the pre-revert state so the revert is recoverable. Read the target
  // ABOVE, before this append, or the state just saved becomes its own target.
  if (capture && !(await captureVersion(deps.store.getState().presentation, deps))) {
    await deps.alertDialog('Your current version could not be saved, so nothing was reverted.', {
      title: 'Revert Failed',
    });
    return false;
  }

  const result = await deps.updatePresentation(id, snapshot as Presentation);
  // Guard the envelope exactly as saveCurrentPresentation does. Loading an
  // undefined result would normalize to undefined and blank the open document.
  if (!result?.success || !result.data) {
    await deps.alertDialog(result?.error || 'Failed to revert your presentation.', {
      title: 'Revert Failed',
    });
    return false;
  }

  const normalized = normalizePresentation(result.data);
  applyRestored(normalized, deps, navigate);
  // THE INVARIANT: the newest version must equal the document again. With
  // `capture: false` nothing was appended, so the target already is the newest.
  if (capture) await captureVersion(normalized, deps);
  return true;
}

/** Parse a stored snapshot, rejecting anything that is not a real document. */
function parseSnapshot(raw: string): Presentation | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  // `JSON.parse('null')` succeeds; passing that on would have the main process
  // destructure null and throw.
  if (!value || typeof value !== 'object' || !Array.isArray((value as Presentation).sections)) {
    return null;
  }
  return value as Presentation;
}

/** Put a restored document into the editor and mark it committed. */
function applyRestored(normalized: Presentation, deps: VersionDeps, navigate: boolean): void {
  const store = deps.store.getState();
  store.setPresentation(normalized);
  const firstSection = (normalized?.sections as Array<Record<string, unknown>> | undefined)?.[0];
  const firstSlide = (firstSection?.slides as Array<Record<string, unknown>> | undefined)?.[0];
  deps.store
    .getState()
    .setSelectedSlide((firstSection?.id as string) ?? null, (firstSlide?.id as string) ?? null);
  deps.store.getState().setDirty(false);
  deps.store.getState().setRequiresInitialSave(false);
  if (navigate) deps.appStore.getState().setCurrentView('editor');
}

/** True when the live document differs from its newest restore point. */
export async function isDivergedFromLatest(
  presentation: unknown,
  deps: VersionDeps = defaultDeps()
): Promise<boolean> {
  const id = idOf(presentation);
  if (id === null) return false;
  return hasDiverged(presentation, await readLatestSnapshot(id, deps));
}

/** Re-exported so callers need only one import for the restore-point concept. */
export { VERSION_EXEMPT_PRESENTATION_IDS, presentationContentKey };
