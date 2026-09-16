import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { getVersion, listVersionSummaries } from '@/utils/ipc';
import { confirmDialog } from '@/utils/dialog';
import { restoreVersion } from '@/utils/presentationVersionsSync';
import { formatVersionLabels, formatVersionTimestamp } from '@/utils/versionLabels';
import { diffPresentationStructure } from '@/utils/versionDiff';

/**
 * Version History (plan A6).
 *
 * Lists the restore points `⌘S` has created and lets you go back to one.
 * Restoring keeps the current state as a version first, so it is itself
 * undoable — the row directly below "Current" is where you just came from.
 *
 * Plan VH2 (issue #160): a Preview pane shows what restoring a version would
 * change — compared against the CURRENT document, unsaved edits included,
 * because that is "what I'm doing right now".
 */

const BADGE = { added: 'new', removed: 'gone' };
const SLIDE_ASPECT = {
  text: 'Text',
  formatting: 'Formatting',
  label: 'Label',
  notes: 'Notes',
  background: 'Background',
  layout: 'Layout',
};
const SECTION_ASPECT = {
  title: 'Renamed',
  type: 'Type',
  background: 'Background',
  order: 'Reordered',
};

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * What restoring would do, as verb-first sentences with the real values in
 * (issue #163: "1 changed" read as a bare count with no subject).
 */
export function summaryLines(summary) {
  const lines = [];
  if (summary.slidesChanged) lines.push(`Change ${plural(summary.slidesChanged, 'slide')}`);
  if (summary.slidesAdded) lines.push(`Add ${plural(summary.slidesAdded, 'slide')}`);
  if (summary.slidesRemoved) lines.push(`Remove ${plural(summary.slidesRemoved, 'slide')}`);
  if (summary.sectionsAdded) lines.push(`Add ${plural(summary.sectionsAdded, 'section')}`);
  if (summary.sectionsRemoved) lines.push(`Remove ${plural(summary.sectionsRemoved, 'section')}`);
  if (summary.backgroundsChanged)
    lines.push(`Change ${plural(summary.backgroundsChanged, 'background')}`);
  if (summary.titleChanged)
    lines.push(`Rename "${summary.titleBefore}" to "${summary.titleAfter}"`);
  if (summary.aspectChanged) lines.push('Change the aspect ratio');
  return lines.length ? lines : ['No content differences'];
}

/**
 * Parse a stored snapshot the same way `restoreVersion` does: it must be a real
 * document. `JSON.parse('null')` succeeds and must not become a diff target.
 */
function parseSnapshot(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !Array.isArray(value.sections)) return null;
  return value;
}

function Badge({ status }) {
  const text = BADGE[status];
  if (!text) return null;
  const tone = status === 'removed' ? 'text-text-tertiary' : 'text-accent';
  return <span className={`ml-1.5 text-[10px] uppercase tracking-wide ${tone}`}>{text}</span>;
}

/** "Now: … / After restore: …" for a changed slide; what you gain or lose otherwise. */
function SlideDetail({ slide }) {
  const line = 'text-[11px] leading-5';
  const labelCls = 'text-text-tertiary mr-1';
  if (slide.status === 'changed') {
    return (
      <div className="ml-3 mb-1">
        <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
          {(slide.changes || []).map((a) => SLIDE_ASPECT[a] || a).join(' · ')}
        </p>
        {slide.before !== slide.after && (
          <>
            <p className={`${line} text-text-secondary`}>
              <span className={labelCls}>Now:</span>
              <span>{slide.before}</span>
            </p>
            <p className={`${line} text-text-primary`}>
              <span className={labelCls}>After restore:</span>
              <span>{slide.after}</span>
            </p>
          </>
        )}
      </div>
    );
  }
  if (slide.status === 'added' && slide.after) {
    return (
      <p className={`${line} ml-3 text-text-secondary`}>
        <span className={labelCls}>Adds:</span>
        <span>{slide.after}</span>
      </p>
    );
  }
  if (slide.status === 'removed' && slide.before) {
    return (
      <p className={`${line} ml-3 text-text-tertiary line-through`}>
        <span className="mr-1">Removes:</span>
        <span>{slide.before}</span>
      </p>
    );
  }
  return null;
}

export default function VersionHistoryModal() {
  const presentationId = useEditorStore((s) => s.presentationId);
  const setVersionHistoryOpen = useAppStore((s) => s.setVersionHistoryOpen);

  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Captured when the list loads rather than read during render: `Date.now()`
  // in a render body is an impure call, and the labels only need to be relative
  // to when the panel was opened.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  // The open preview: `{ version, status: 'loading' | 'error' | 'ready', diff?, message? }`.
  const [preview, setPreview] = useState(null);
  const previewOpenRef = useRef(false);
  useEffect(() => {
    previewOpenRef.current = preview !== null;
  }, [preview]);

  const load = useCallback(async () => {
    if (presentationId === null || presentationId === undefined) return;
    const result = await listVersionSummaries(presentationId);
    if (result?.success) {
      const list = result.data || [];
      setVersions(list);
      setError(null);
      // Keep the Version History command's gate accurate after a restore or
      // revert appended rows (plan VH1's count is otherwise set only on open
      // and save).
      useEditorStore.getState().setVersionCount(list.length);
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

  // Escape closes, like every other overlay (plan E3) — the preview pane first,
  // then the modal.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (previewOpenRef.current) {
        setPreview(null);
        return;
      }
      setVersionHistoryOpen(false);
    }
    // Capture phase: consumed before the Editor's stop-presenting listener (L1).
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setVersionHistoryOpen]);

  // Which row is "Current". The app keeps the newest version equal to the
  // committed row whenever the document is clean (the A5/A6 invariant, upheld by
  // save, restore and revert), so Current is simply the newest version — no
  // slide-count guessing, which mismarked when two versions shared a count
  // (plan VH1, issue #159). While the document is dirty, no row is Current and a
  // note says the working copy isn't a version yet.
  const isDirty = useEditorStore((s) => s.isDirty);
  const currentId = isDirty ? null : ((versions || [])[0]?.id ?? null);

  // Plain minute-precision timestamps (plan VH1 dropped the seconds
  // disambiguator). Same-minute rows may share a label; slide count, order and
  // the Current marker still tell them apart.
  const versionLabels = formatVersionLabels(versions || [], loadedAt);

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
    // succeeds and the Current marker would point at the wrong row. The preview
    // compared against a document that no longer exists, so it closes too.
    setPreview(null);
    await load();
  }

  async function handlePreview(version) {
    if (preview?.version.id === version.id) {
      setPreview(null);
      return;
    }
    setPreview({ version, status: 'loading' });
    const result = await getVersion(version.id);
    const snapshot = result?.success && result.data ? parseSnapshot(result.data.snapshot) : null;
    if (!snapshot) {
      setPreview({ version, status: 'error', message: 'This version could not be read.' });
      return;
    }
    // The LIVE document, unsaved edits included: "what I'm doing right now".
    const diff = diffPresentationStructure(useEditorStore.getState().presentation, snapshot);
    setPreview({ version, status: 'ready', diff });
  }

  const previewOpen = preview !== null;

  return (
    <div
      data-backdrop="true"
      className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) setVersionHistoryOpen(false);
      }}
    >
      <div
        className={`bg-bg-surface border border-border-default rounded-[10px] p-6 ${previewOpen ? 'w-[820px]' : 'w-[560px]'} max-h-[80vh] flex flex-col shadow-[0_24px_48px_rgba(0,0,0,0.4)]`}
      >
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
        {!error && versions?.length === 1 && (
          <p className="text-xs mb-2 text-text-secondary">
            This is the only version so far. Save changes to create restore points you can come back
            to.
          </p>
        )}
        {!error && isDirty && (versions?.length ?? 0) > 0 && (
          <p className="text-xs mb-2 text-text-secondary">
            You have unsaved changes — the current document isn’t saved as a version yet.
          </p>
        )}

        <div className="flex gap-4 flex-1 min-h-0">
          <ul className="overflow-y-auto flex-1 min-w-0 -mx-1">
            {(versions || []).map((version, index) => {
              const isCurrent = version.id === currentId;
              const isPreviewing = preview?.version.id === version.id;
              return (
                <li
                  key={version.id}
                  data-version-row={version.id}
                  className="flex items-center justify-between gap-3 px-1 py-2 border-b border-border-subtle last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-text-primary">
                      {versionLabels[index]}
                      {isCurrent && <span className="ml-2 text-[11px] text-accent">Current</span>}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {typeof version.slide_count === 'number'
                        ? `${version.slide_count} ${version.slide_count === 1 ? 'slide' : 'slides'}`
                        : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isCurrent && (
                      <button
                        type="button"
                        data-version-preview={version.id}
                        aria-pressed={isPreviewing}
                        disabled={busy}
                        onClick={() => handlePreview(version)}
                        className="text-[12px] font-medium px-3 py-1 rounded-md border border-border-default text-text-secondary disabled:text-text-tertiary"
                      >
                        Preview
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isCurrent || busy}
                      onClick={() => handleRestore(version)}
                      className="text-[12px] font-medium px-3 py-1 rounded-md border border-border-default text-text-primary disabled:text-text-tertiary"
                    >
                      Restore
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {previewOpen && (
            <aside
              data-version-preview-pane={preview.version.id}
              className="w-[300px] shrink-0 overflow-y-auto border-l border-border-subtle pl-4"
            >
              <p className="text-[11px] text-text-secondary mb-1">
                {formatVersionTimestamp(preview.version.saved_at, loadedAt)}
              </p>
              {preview.status === 'loading' && (
                <p className="text-xs text-text-secondary">Comparing…</p>
              )}
              {preview.status === 'error' && (
                <p className="text-xs text-text-secondary">{preview.message}</p>
              )}
              {preview.status === 'ready' && (
                <>
                  <p className="text-[12px] font-semibold text-text-primary mb-1">
                    Restoring this version would:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {summaryLines(preview.diff.summary).map((chip) => (
                      <span
                        key={chip}
                        className="text-[11px] px-2 py-0.5 rounded-full border border-border-subtle text-text-secondary"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  {preview.diff.tree.map((section) => (
                    <div key={section.id} className="mb-2">
                      <p
                        className={`text-[12px] font-medium ${
                          section.status === 'removed'
                            ? 'line-through text-text-tertiary'
                            : 'text-text-primary'
                        }`}
                      >
                        {section.title || 'Untitled section'}
                        <Badge status={section.status} />
                        {section.status === 'changed' && section.changes?.length > 0 && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-text-secondary">
                            {section.changes.map((a) => SECTION_ASPECT[a] || a).join(' · ')}
                          </span>
                        )}
                      </p>
                      <ul className="ml-3">
                        {section.slides.map((slide) => {
                          // A changed slide named from its own body would just repeat
                          // the "Now:" line; show the name only when it is a real label.
                          const showName = !(
                            slide.status === 'changed' && slide.name === slide.preview
                          );
                          return (
                            <li key={slide.id}>
                              {showName && (
                                <p
                                  className={`text-[11px] leading-5 ${
                                    slide.status === 'removed'
                                      ? 'line-through text-text-tertiary'
                                      : 'text-text-secondary'
                                  }`}
                                >
                                  {slide.name}
                                  <Badge status={slide.status} />
                                </p>
                              )}
                              <SlideDetail slide={slide} />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRestore(preview.version)}
                    className="mt-2 text-[12px] font-medium px-3 py-1 rounded-md border border-border-default text-text-primary disabled:text-text-tertiary"
                  >
                    Restore this version
                  </button>
                </>
              )}
            </aside>
          )}
        </div>

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
