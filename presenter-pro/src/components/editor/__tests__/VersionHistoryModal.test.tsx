// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/utils/ipc', () => ({ listVersionSummaries: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ confirmDialog: vi.fn() }));
vi.mock('@/utils/presentationVersionsSync', () => ({ restoreVersion: vi.fn() }));

import { listVersionSummaries } from '@/utils/ipc';
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
