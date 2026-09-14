// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan D3.
//   SAVE-A1 — the song editor's unsaved edits live in the modal, not the
//   editor store, so quitting with it open dropped them silently. The modal now
//   registers with `blockingEditors`, which quit / close / New / Open consult.
//   SONG-2 — focusing Raw Lyrics showed the text from when the modal opened;
//   one keystroke and Save then rebuilt the song from that stale text and wiped
//   the slide edits made on the right.

vi.mock('@/utils/ipc', () => ({ createSong: vi.fn(), updateSong: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn(), showDialog: vi.fn() }));

import { updateSong } from '@/utils/ipc';
import { showDialog } from '@/utils/dialog';
import { resolveBlockingEditors } from '@/utils/blockingEditors';
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
    {
      id: 'g2',
      type: 'chorus',
      label: 'Chorus',
      slides: [{ id: 's2', body: 'My chains are gone' }],
    },
  ]),
  songOrder: JSON.stringify(['g1', 'g2']),
};

const lyricsBox = () =>
  screen.getByPlaceholderText(/Paste or type song lyrics/) as HTMLTextAreaElement;

/**
 * The large editor for the selected slide. The same text also appears in the
 * section's slide list, so it is picked out by its size class, not its value.
 */
const selectedSlideEditor = () => {
  const matches = screen
    .getAllByDisplayValue('Amazing grace how sweet the sound')
    .filter((element) => element.className.includes('min-h-[180px]'));
  expect(matches).toHaveLength(1);
  return matches[0] as HTMLTextAreaElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  (updateSong as Mock).mockResolvedValue({ success: true, data: { id: 3 } });
});

describe('SongEditorModal — quit and close ask the song editor first (SAVE-A1)', () => {
  it('does not ask when nothing was edited', async () => {
    const onClose = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={vi.fn()} />);

    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await resolveBlockingEditors();
    });

    expect(allowed).toBe(true);
    expect(showDialog).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks about unsaved song edits, and blocks when the dialog is dismissed', async () => {
    (showDialog as Mock).mockResolvedValue(null);
    const onClose = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Song title'), {
      target: { value: 'Amazing Grace (edited)' },
    });

    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await resolveBlockingEditors();
    });

    expect(showDialog).toHaveBeenCalledTimes(1);
    expect(allowed).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(updateSong).not.toHaveBeenCalled();
  });

  it('lets the action proceed after Discard', async () => {
    (showDialog as Mock).mockResolvedValue({ action: 'discard' });
    const onClose = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Song title'), {
      target: { value: 'Amazing Grace (edited)' },
    });

    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await resolveBlockingEditors();
    });

    expect(allowed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateSong).not.toHaveBeenCalled();
  });

  it('saves the song, then lets the action proceed, after Save', async () => {
    (showDialog as Mock).mockResolvedValue({ action: 'save' });
    const onClose = vi.fn();
    render(<SongEditorModal song={SONG} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Song title'), {
      target: { value: 'Amazing Grace (edited)' },
    });

    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await resolveBlockingEditors();
    });

    expect(allowed).toBe(true);
    expect(updateSong).toHaveBeenCalledTimes(1);
    expect((updateSong as Mock).mock.calls[0]?.[1]?.title).toBe('Amazing Grace (edited)');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops blocking once the modal is gone', async () => {
    const { unmount } = render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Song title'), {
      target: { value: 'Amazing Grace (edited)' },
    });

    unmount();

    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await resolveBlockingEditors();
    });
    expect(allowed).toBe(true);
    expect(showDialog).not.toHaveBeenCalled();
  });
});

describe('SongEditorModal — Raw Lyrics shows the song as it is now (SONG-2)', () => {
  it('shows a slide edit made on the right when Raw Lyrics is focused', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(selectedSlideEditor(), {
      target: { value: 'Amazing grace EDITED ON THE RIGHT' },
    });
    fireEvent.focus(lyricsBox());

    expect(lyricsBox().value).toContain('Amazing grace EDITED ON THE RIGHT');
    expect(lyricsBox().value).not.toContain('how sweet the sound');
  });

  it('a keystroke in Raw Lyrics and Save keep the slide edit', async () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(selectedSlideEditor(), {
      target: { value: 'Amazing grace EDITED ON THE RIGHT' },
    });
    fireEvent.focus(lyricsBox());
    fireEvent.change(lyricsBox(), { target: { value: `${lyricsBox().value} ` } });
    fireEvent.click(screen.getByText('Save to Library'));

    await waitFor(() => expect(updateSong).toHaveBeenCalledTimes(1));
    const slides = JSON.parse((updateSong as Mock).mock.calls[0]?.[1]?.slides);
    const bodies = slides.map((slide: { body: string }) => slide.body);
    expect(bodies).toContain('Amazing grace EDITED ON THE RIGHT');
    expect(bodies).not.toContain('Amazing grace how sweet the sound');
  });
});
