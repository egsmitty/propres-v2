// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Plan D2 #11–#13 — characterization of the song editor's derived views
// BEFORE its sync effects are replaced: the form loads from `song` once, the
// raw-lyrics textarea mirrors the groups until the user edits it.

vi.mock('@/utils/ipc', () => ({ createSong: vi.fn(), updateSong: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn(), showDialog: vi.fn() }));

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

describe('SongEditorModal', () => {
  it('loads the title and groups from the song', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByPlaceholderText('Song title')).toHaveValue('Amazing Grace');
    expect(screen.getAllByText('Verse 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chorus').length).toBeGreaterThan(0);
  });

  it('the raw-lyrics textarea is derived from the groups', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    const value = lyricsBox().value;
    expect(value.startsWith('Verse 1')).toBe(true);
    expect(value).toContain('Amazing grace how sweet the sound');
    expect(value).toContain('My chains are gone');
  });

  it('typing in the textarea keeps the typed text (dirty draft wins over the groups)', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.focus(lyricsBox());
    fireEvent.change(lyricsBox(), { target: { value: 'Verse 1\n\nA brand new line' } });
    expect(lyricsBox().value).toBe('Verse 1\n\nA brand new line');
  });

  it('a new song starts empty', () => {
    render(<SongEditorModal song={null} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByPlaceholderText('Song title')).toHaveValue('');
    expect(lyricsBox().value).toBe('');
  });
});
