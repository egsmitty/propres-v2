// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/utils/ipc', () => ({ listVersionSummaries: vi.fn(), getVersion: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ confirmDialog: vi.fn() }));
vi.mock('@/utils/presentationVersionsSync', () => ({ restoreVersion: vi.fn() }));

import { getVersion, listVersionSummaries } from '@/utils/ipc';
import { confirmDialog } from '@/utils/dialog';
import { restoreVersion } from '@/utils/presentationVersionsSync';
import { useEditorStore } from '@/store/editorStore';
import VersionHistoryModal from '@/components/editor/VersionHistoryModal';

// Plan A6. The row directly below "Current" is the pre-restore state — it is how
// "restoring is undoable" is actually reached, so disabling it would make the
// flagship behaviour unreachable through the only UI that exposes it.

const INITIAL_STATE = useEditorStore.getState();

/** Two slides, matching SUMMARIES[0].slide_count so that row is "Current". */
const PRESENTATION = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    {
      id: 'sec-1',
      type: 'announcement',
      title: 'Slides',
      slides: [
        { id: 's1', body: 'a' },
        { id: 's2', body: 'b' },
      ],
    },
  ],
};

const SUMMARIES = [
  { id: 3, saved_at: Math.floor(Date.now() / 1000) - 60, slide_count: 2 },
  { id: 2, saved_at: Math.floor(Date.now() / 1000) - 3600, slide_count: 5 },
  { id: 1, saved_at: Math.floor(Date.now() / 1000) - 7200, slide_count: 9 },
];

function restoreButtons(): HTMLButtonElement[] {
  return screen.getAllByRole('button', { name: 'Restore' }) as HTMLButtonElement[];
}

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7, isDirty: false });
  vi.clearAllMocks();
  vi.mocked(listVersionSummaries).mockResolvedValue({ success: true, data: SUMMARIES });
  vi.mocked(restoreVersion).mockResolvedValue(true);
});

async function renderModal() {
  render(<VersionHistoryModal />);
  await waitFor(() => expect(restoreButtons()).toHaveLength(SUMMARIES.length));
}

describe('VersionHistoryModal', () => {
  it('renders one row per version, newest first', async () => {
    await renderModal();
    const rows = document.querySelectorAll('[data-version-row]');
    expect([...rows].map((r) => r.getAttribute('data-version-row'))).toEqual(['3', '2', '1']);
  });

  it('marks the row matching the open document as Current and disables its Restore', async () => {
    await renderModal();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(restoreButtons()[0]).toBeDisabled();
  });

  it('leaves the row below Current enabled — that is where you came from', async () => {
    await renderModal();
    expect(restoreButtons()[1]).toBeEnabled();
  });

  it('marks nothing as Current while the document has unsaved changes', async () => {
    act(() => useEditorStore.setState({ isDirty: true }));
    await renderModal();
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
  });

  // Plan VH1 (issue #159). Current is the newest version by identity, not a
  // slide-count guess. Here the newest row (id 3) has a different slide count
  // than the document while an older row (id 2) coincidentally matches it — the
  // old guess marked id 2; Current must be the newest, the committed row.
  it('marks the NEWEST version Current, not one that merely shares the slide count', async () => {
    vi.mocked(listVersionSummaries).mockResolvedValue({
      success: true,
      data: [
        { id: 3, saved_at: SUMMARIES[0]!.saved_at, slide_count: 9 },
        { id: 2, saved_at: SUMMARIES[1]!.saved_at, slide_count: 2 },
      ],
    });
    render(<VersionHistoryModal />);
    await waitFor(() => expect(restoreButtons()).toHaveLength(2));

    const currentRow = screen.getByText('Current').closest('[data-version-row]');
    expect(currentRow?.getAttribute('data-version-row')).toBe('3');
    // And the newest row's own Restore is the disabled one.
    expect(restoreButtons()[0]).toBeDisabled();
  });

  // Plan VH1: while dirty, no row is Current and a note says the working copy is
  // not a version yet — so "doesn't show the current when unsaved" is answered.
  it('shows an unsaved-changes note while the document is dirty', async () => {
    act(() => useEditorStore.setState({ isDirty: true }));
    await renderModal();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('asks for confirmation and restores that row when confirmed', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    await renderModal();

    await act(async () => restoreButtons()[1]!.click());

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(restoreVersion).mock.calls).toEqual([[2]]);
  });

  it('restores nothing when the confirmation is cancelled', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);
    await renderModal();

    await act(async () => restoreButtons()[1]!.click());

    expect(restoreVersion).toHaveBeenCalledTimes(0);
  });

  it('re-fetches the list after a successful restore', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    await renderModal();
    expect(listVersionSummaries).toHaveBeenCalledTimes(1);

    await act(async () => restoreButtons()[1]!.click());

    // Restoring APPENDS rows, so an un-refreshed list is stale the instant it
    // succeeds and its Current marker points at the wrong row.
    await waitFor(() => expect(listVersionSummaries).toHaveBeenCalledTimes(2));
  });
});

// Plan VH2 (issue #160). Preview a version AGAINST THE CURRENT DOCUMENT — the
// user's decision: "what will change if I restore this?" — inside the modal.
describe('preview (VH2)', () => {
  /** The version keeps only s1, so restoring it would REMOVE s2 ("b"). */
  function snapshotWithOnlyS1() {
    const section = PRESENTATION.sections[0]!;
    return JSON.stringify({
      ...PRESENTATION,
      sections: [{ ...section, slides: [section.slides[0]] }],
    });
  }
  function previewButtons(): HTMLButtonElement[] {
    return [...document.querySelectorAll('[data-version-preview]')] as HTMLButtonElement[];
  }

  beforeEach(() => {
    vi.mocked(getVersion).mockResolvedValue({
      success: true,
      data: { id: 2, presentation_id: 7, snapshot: snapshotWithOnlyS1(), saved_at: 1 },
    });
  });

  it('shows a Preview on every non-Current row and none on the Current row', async () => {
    await renderModal();
    expect(previewButtons()).toHaveLength(2);
    expect(document.querySelector('[data-version-row="3"] [data-version-preview]')).toBeNull();
  });

  it('records the version count in the store when the list loads (VH1 follow-up)', async () => {
    await renderModal();
    expect(useEditorStore.getState().versionCount).toBe(SUMMARIES.length);
  });

  it('fetches that version once and says what restoring it would change', async () => {
    await renderModal();
    await act(async () => previewButtons()[0]!.click());

    expect(vi.mocked(getVersion).mock.calls).toEqual([[2]]);
    expect(await screen.findByText(/Restoring this version would/)).toBeInTheDocument();
    expect(screen.getByText('−1 slide')).toBeInTheDocument();
    // The slide you would lose is listed, marked gone.
    expect(screen.getByText('gone')).toBeInTheDocument();
  });

  it('shows an inline message for a version that cannot be read', async () => {
    vi.mocked(getVersion).mockResolvedValue({
      success: true,
      data: { id: 2, presentation_id: 7, snapshot: 'not json', saved_at: 1 },
    });
    await renderModal();
    await act(async () => previewButtons()[0]!.click());
    expect(await screen.findByText('This version could not be read.')).toBeInTheDocument();
  });

  it('restores from the preview pane through the same confirmation', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    await renderModal();
    await act(async () => previewButtons()[0]!.click());
    await screen.findByText(/Restoring this version would/);

    await act(async () => screen.getByRole('button', { name: 'Restore this version' }).click());

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(restoreVersion).mock.calls).toEqual([[2]]);
  });

  it('clicking Preview on the open row again closes the pane', async () => {
    await renderModal();
    await act(async () => previewButtons()[0]!.click());
    await screen.findByText(/Restoring this version would/);
    await act(async () => previewButtons()[0]!.click());
    expect(screen.queryByText(/Restoring this version would/)).not.toBeInTheDocument();
  });
});
