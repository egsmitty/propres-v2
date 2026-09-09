import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { normalizePresentation } from '@/utils/backgrounds';
import { alertDialog } from '@/utils/dialog';
import { getLatestVersion, updatePresentation, writeVersion } from '@/utils/ipc';
import { hasDiverged, presentationContentKey } from '@/utils/presentationVersions';

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

/**
 * Presentation ids for which no version is ever captured. Every entry REQUIRES
 * a justifying comment and must be reported. Do not add entries to make
 * something pass.
 */
export const VERSION_EXEMPT_PRESENTATION_IDS: ReadonlyArray<number> = [];

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
  writeVersion: (data: { presentationId: number; snapshot: string }) => Promise<unknown>;
  getLatestVersion: (presentationId: number) => Promise<Envelope<VersionRow | null> | null>;
  updatePresentation: (id: number, data: Presentation) => Promise<Envelope<Presentation> | null>;
  alertDialog: (message: string, options?: Record<string, unknown>) => Promise<unknown>;
  store: typeof useEditorStore;
  appStore: typeof useAppStore;
}

function defaultDeps(): VersionDeps {
  return {
    writeVersion,
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
): Promise<void> {
  const id = idOf(presentation);
  if (id === null || VERSION_EXEMPT_PRESENTATION_IDS.includes(id)) return;

  const snapshot = JSON.stringify(presentation);
  const newest = await latestRow(id, deps);
  if (newest && !hasDiverged(presentation, newest.snapshot)) return;

  await deps.writeVersion({ presentationId: id, snapshot });
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
 * Put the live row back to the newest version and load it into the editor.
 *
 * Every failure path returns `false` having changed nothing, and says so — a
 * destructive-sounding confirmation that silently no-ops is worse than an
 * error. `navigate: false` is for the Unsaved Changes dialog, whose callers are
 * all *leaving* the editor and must not be dragged back to it.
 */
export async function revertToLatestVersion(
  id: number,
  options: { navigate?: boolean } = {},
  deps: VersionDeps = defaultDeps()
): Promise<boolean> {
  const { navigate = true } = options;

  const row = await latestRow(id, deps);
  if (!row) {
    await deps.alertDialog('There is no saved version to revert to.', {
      title: 'Nothing to Revert',
    });
    return false;
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(row.snapshot);
  } catch {
    await deps.alertDialog('The last saved version could not be read.', { title: 'Revert Failed' });
    return false;
  }

  // `JSON.parse('null')` succeeds; passing that on would have the main process
  // destructure null and throw. Require a real document.
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !Array.isArray((snapshot as Presentation).sections)
  ) {
    await deps.alertDialog('The last saved version could not be read.', { title: 'Revert Failed' });
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
  const state = deps.store.getState();
  state.setPresentation(normalized);
  const firstSection = normalized?.sections?.[0];
  const firstSlide = firstSection?.slides?.[0];
  deps.store.getState().setSelectedSlide(firstSection?.id ?? null, firstSlide?.id ?? null);
  deps.store.getState().setDirty(false);
  deps.store.getState().setRequiresInitialSave(false);
  if (navigate) deps.appStore.getState().setCurrentView('editor');
  return true;
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
export { presentationContentKey };
