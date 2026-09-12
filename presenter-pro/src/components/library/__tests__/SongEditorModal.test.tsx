// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan D2 #11–#13 — characterization of the song editor's derived views
// BEFORE its sync effects are replaced: the form loads from `song` once, the
// raw-lyrics textarea mirrors the groups until the user edits it.

vi.mock('@/utils/ipc', () => ({ createSong: vi.fn(), updateSong: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn(), showDialog: vi.fn() }));

import { updateSong } from '@/utils/ipc';
import { makeSongGroupLabel } from '@/utils/songSections';
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

/** Two verses, so the occurrence number is actually at stake. */
const TWO_VERSE_SONG = {
  id: 4,
  title: 'Two Verses',
  artist: '',
  ccli: '',
  songGroups: JSON.stringify([
    { id: 'g1', type: 'verse', label: 'Verse', slides: [{ id: 's1', body: 'first' }] },
    { id: 'g2', type: 'verse', label: 'Verse 2', slides: [{ id: 's2', body: 'second' }] },
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

// Plan G1 — the name you type is the name you get.
//
// Ethan, 2026-09-11: "i was talking about the name of a verse or bridge if you
// delete it all it just fills it." Both halves of that are one expression in
// `normalizeSongEditorGroups`, which `commitGroups` ran on EVERY keystroke: it
// trimmed the draft and regenerated the auto label when the result was empty.
// The input is controlled, so the rewritten value went straight back into the
// DOM between keystrokes.
//
// These assert the typed string EXACTLY. A trailing space is the whole point —
// without it you cannot type "Verse 1", because the space dies before you reach
// the 1. Never relax these to `toContain` or trim them.

/** The name field of the nth song part. Throws rather than returning
 *  undefined, so a missing field fails as a missing field. */
function partNameInput(index = 0): HTMLInputElement {
  const found = screen.getAllByPlaceholderText('Section name')[index];
  if (!found) throw new Error(`no part-name input at index ${index}`);
  return found as HTMLInputElement;
}

/** The first argument pair of the single expected updateSong call. */
function savedSongData(): { songGroups: string } {
  const call = (updateSong as unknown as Mock).mock.calls[0];
  if (!call) throw new Error('updateSong was never called');
  return call[1] as { songGroups: string };
}

describe('SongEditorModal — part names are free-form while you type (plan G1)', () => {
  it('keeps a trailing space, so a numbered name can be typed at all', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(partNameInput(), { target: { value: 'Verse ' } });

    // Exactly, including the space. This is the keystroke you could not make.
    expect(partNameInput().value).toBe('Verse ');

    // And the next keystroke lands where it should.
    fireEvent.change(partNameInput(), { target: { value: 'Verse 1' } });
    expect(partNameInput().value).toBe('Verse 1');
  });

  it('lets the field go empty and stay empty', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(partNameInput(), { target: { value: '' } });

    // Before the fix this snapped straight back to the auto label.
    expect(partNameInput().value).toBe('');
  });

  it('keeps the occurrence number in the lyrics mirror while a field is empty', () => {
    // A REGRESSION GUARD, not a reproduction. The naive fix — falling back to
    // `makeSongGroupLabel(type)` with no number — would rewrite this song's
    // "Verse 2" header to "Verse" as you cleared the field. That header is not
    // decoration: it feeds the dirty check AND the save re-parse, so two
    // cleared verses would both emit "Verse" and the numbering would collapse
    // on save with no prompt. Same class of bug, new place.
    render(<SongEditorModal song={TWO_VERSE_SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    const secondVerse = 1;

    fireEvent.change(partNameInput(secondVerse), { target: { value: '' } });

    expect(lyricsBox().value).toContain(makeSongGroupLabel('verse', '', '2'));
  });

  it('resolves an empty name to the auto label once, at save', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(partNameInput(), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save to Library'));

    return waitFor(() => {
      expect(updateSong).toHaveBeenCalled();
      const groups = JSON.parse(savedSongData().songGroups);
      // Derived from the production labeller, not a hardcoded string: the first
      // occurrence carries no number.
      expect(groups[0].label).toBe(makeSongGroupLabel('verse'));
    });
  });

  it('keeps a name the user actually typed, through save', () => {
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(partNameInput(), { target: { value: 'Verse 1' } });
    fireEvent.click(screen.getByText('Save to Library'));

    return waitFor(() => {
      expect(JSON.parse(savedSongData().songGroups)[0].label).toBe('Verse 1');
    });
  });

  it('renames an unnamed part when its type changes', () => {
    // A type change is a commit, not a keystroke, so re-labelling is correct
    // here — pinned so it is not rediscovered as a bug later.
    render(<SongEditorModal song={SONG} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(partNameInput(), { target: { value: '' } });

    const typeSelect = screen.getAllByRole('combobox')[0];
    if (!typeSelect) throw new Error('no part-type select');
    fireEvent.change(typeSelect, { target: { value: 'bridge' } });

    expect(partNameInput().value).toBe(makeSongGroupLabel('bridge'));
  });
});
