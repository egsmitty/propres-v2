import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { listVersionSummaries } from '@/utils/ipc';
import { confirmDialog } from '@/utils/dialog';
import { restoreVersion } from '@/utils/presentationVersionsSync';
import { formatVersionTimestamp } from '@/utils/versionLabels';

/**
 * Version History (plan A6).
 *
 * Lists the restore points `⌘S` has created and lets you go back to one.
 * Restoring keeps the current state as a version first, so it is itself
 * undoable — the row directly below "Current" is where you just came from.
 */
export default function VersionHistoryModal() {
  const presentation = useEditorStore((s) => s.presentation);
  const presentationId = useEditorStore((s) => s.presentationId);
  const setVersionHistoryOpen = useAppStore((s) => s.setVersionHistoryOpen);

  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Captured when the list loads rather than read during render: `Date.now()`
  // in a render body is an impure call, and the labels only need to be relative
  // to when the panel was opened.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (presentationId === null || presentationId === undefined) return;
    const result = await listVersionSummaries(presentationId);
    if (result?.success) {
      setVersions(result.data || []);
      setError(null);
    } else {
      setError(result?.error || 'Version history could not be loaded.');
    }
    setLoadedAt(Date.now());
  }, [presentationId]);

  useEffect(() => {
    let cancelled = false;
    async function loadVersions() {
      if (cancelled) return;
      await load();
    }
    loadVersions();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Escape closes, like every other overlay (plan E3).
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setVersionHistoryOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setVersionHistoryOpen]);

  // The number of slides in the open document, used to mark which row you are
  // looking at. Derived from the document rather than assuming "the newest row
  // is current", so the marker cannot drift if anything ever appends out of
  // band — and while the document is dirty, no row is marked, which is honest.
  const liveSlideCount = (presentation?.sections || []).reduce(
    (total, section) => total + (section.slides?.length || 0),
    0
  );
  const isDirty = useEditorStore((s) => s.isDirty);
  const currentId = isDirty
    ? null
    : ((versions || []).find((v) => v.slide_count === liveSlideCount)?.id ?? null);

  async function handleRestore(version) {
    const ok = await confirmDialog(
      `Restore the version from ${formatVersionTimestamp(version.saved_at, loadedAt)}? ` +
        'Your current version is kept, so you can come back to it. The title is restored too.',
      { title: 'Restore Version', confirmLabel: 'Restore', danger: true }
    );
    if (!ok) return;

    setBusy(true);
    const restored = await restoreVersion(version.id);
    setBusy(false);
    if (!restored) return;

    // Restoring APPENDS rows, so the list on screen is stale the instant it
    // succeeds and the Current marker would point at the wrong row.
    await load();
  }

  return (
    <div
      data-backdrop="true"
      className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) setVersionHistoryOpen(false);
      }}
    >
      <div className="bg-bg-surface border border-border-default rounded-[10px] p-6 w-[420px] max-h-[70vh] flex flex-col shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
        <h2 className="text-sm font-semibold mb-1 text-text-primary">Version History</h2>
        <p className="text-xs mb-4 text-text-secondary">
          Every time you save, PresenterPro keeps a version you can come back to.
        </p>

        {error && <p className="text-xs text-text-secondary">{error}</p>}
        {!error && versions === null && (
          <p className="text-xs text-text-secondary">Loading your versions…</p>
        )}
        {!error && versions?.length === 0 && (
          <p className="text-xs text-text-secondary">
            No versions yet. Save this presentation to create one.
          </p>
        )}

        <ul className="overflow-y-auto flex-1 -mx-1">
          {(versions || []).map((version) => {
            const isCurrent = version.id === currentId;
            return (
              <li
                key={version.id}
                data-version-row={version.id}
                className="flex items-center justify-between gap-3 px-1 py-2 border-b border-border-subtle last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-text-primary">
                    {formatVersionTimestamp(version.saved_at, loadedAt)}
                    {isCurrent && <span className="ml-2 text-[11px] text-accent">Current</span>}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    {typeof version.slide_count === 'number'
                      ? `${version.slide_count} ${version.slide_count === 1 ? 'slide' : 'slides'}`
                      : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isCurrent || busy}
                  onClick={() => handleRestore(version)}
                  className="text-[12px] font-medium px-3 py-1 rounded-md border border-border-default text-text-primary disabled:text-text-tertiary"
                >
                  Restore
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => setVersionHistoryOpen(false)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-border-default text-text-primary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
