// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan D1 (audit SAVE-A2 / SONG-1). The song editor's Save awaited
// `updateSong` / `createSong` and never looked at the result. The IPC layer
// returns `{ success: false }` rather than throwing, so the `catch` never ran:
// a failed save called onSave() and onClose() exactly as if it had worked, and
// the edits went with the closed modal. Songs have no autosave, so nothing else
// had them.
//
// SongEditorModal.test.tsx (plans D2, G1, G3) must pass unchanged.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({ createSong: vi.fn(), updateSong: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn(), showDialog: vi.fn() }));

import { createSong, updateSong } from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import SongEditorModal from '@/components/library/SongEditorModal';

const SONG = {
  id: 3,
  title: 'Amazing Grace',
  artist: 'John Newton',
  ccli: '',
  songGroups: JSON.stringify([
    {
      id: 'g1',
      type: 'verse',
      label: 'Verse 1',
      slides: [{ id: 's1', body: 'Amazing grace how sweet the sound' }],
    },
  ]),
  songOrder: JSON.stringify(['g1']),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(alertDialog).mockResolvedValue(undefined);
});

function saveButton() {
  return screen.getByText('Save to Library');
}

describe('SongEditorModal — a save that fails keeps your work on screen', () => {
  it('a failed update says so and leaves the editor open', async () => {
    vi.mocked(updateSong).mockResolvedValue({ success: false, error: 'database is locked' });
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={onSave} />);

    fireEvent.click(saveButton());

    await waitFor(() => expect(alertDialog).toHaveBeenCalledTimes(1));
    expect(vi.mocked(alertDialog).mock.calls[0]).toEqual([
      'database is locked',
      { title: 'Save Failed' },
    ]);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    // Not stuck in "Saving…": the user can try again.
    await waitFor(() => expect(saveButton()).toBeInTheDocument());
  });

  it('a song that no longer exists in the library is not reported as saved', async () => {
    vi.mocked(updateSong).mockResolvedValue({ success: true, data: null });
    const onClose = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={vi.fn()} />);

    fireEvent.click(saveButton());

    await waitFor(() => expect(alertDialog).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(alertDialog).mock.calls[0]?.[0])).toMatch(/no longer exists/i);
    expect(vi.mocked(alertDialog).mock.calls[0]?.[1]).toEqual({ title: 'Save Failed' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a new song that could not be created says so and leaves the editor open', async () => {
    vi.mocked(createSong).mockResolvedValue({ success: false, error: 'disk full' });
    const onClose = vi.fn();
    render(<SongEditorModal song={null} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Song title'), {
      target: { value: 'Brand New Song' },
    });

    fireEvent.click(saveButton());

    await waitFor(() => expect(alertDialog).toHaveBeenCalledTimes(1));
    expect(vi.mocked(alertDialog).mock.calls[0]).toEqual(['disk full', { title: 'Save Failed' }]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a save that works still notifies and closes, with no alert', async () => {
    vi.mocked(updateSong).mockResolvedValue({ success: true, data: { ...SONG } });
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={onSave} />);

    fireEvent.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(alertDialog).not.toHaveBeenCalled();
  });
});
