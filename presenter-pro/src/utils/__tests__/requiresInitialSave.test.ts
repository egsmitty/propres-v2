import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/ipc', () => ({
  createPresentation: vi.fn(),
  createMedia: vi.fn(),
  deletePresentation: vi.fn(),
  getMedia: vi.fn(),
  getSongs: vi.fn(),
  pickMedia: vi.fn(),
  getPresentation: vi.fn(),
  resolveBuiltInMedia: vi.fn(),
  touchPresentation: vi.fn(),
  updatePresentation: vi.fn(),
  writeVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  deleteVersionsFor: vi.fn(),
  listVersions: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  alertDialog: vi.fn(),
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
}));
vi.mock('@/utils/builtInSongSeed', () => ({ ensureBuiltInSongsSeeded: vi.fn() }));

import { useEditorStore } from '@/store/editorStore';
import { insertNewSlideIntoCurrentPresentation } from '@/utils/presentationCommands';

// `setPresentation` resets `requiresInitialSave` to `options.requiresInitialSave
// ?? false` (editorStore.js). Ordinary edit paths call it with no options, so a
// brand-new presentation silently became "already saved" after a single insert.
//
// Pre-existing bug: today it means Discard leaves an unwanted presentation
// behind instead of deleting it. Under autosave it decides between two
// DESTRUCTIVE Discard branches — revert-the-row versus delete-the-row — so it
// has to be right before slice 2 lands.

const INITIAL_STATE = useEditorStore.getState();

const PRESENTATION = {
  id: 7,
  title: 'Untitled Presentation',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: '' }] },
  ],
  aspectRatio: '16:9',
};

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
});

describe('inserting a slide preserves requiresInitialSave', () => {
  it('keeps it true on a presentation that has never been saved', async () => {
    useEditorStore.setState({
      presentation: PRESENTATION,
      presentationId: 7,
      selectedSectionId: 'sec-1',
      selectedSlideId: 's1',
      requiresInitialSave: true,
    });

    await insertNewSlideIntoCurrentPresentation();

    expect(useEditorStore.getState().requiresInitialSave).toBe(true);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('leaves it false on a presentation that has been saved', async () => {
    useEditorStore.setState({
      presentation: PRESENTATION,
      presentationId: 7,
      selectedSectionId: 'sec-1',
      selectedSlideId: 's1',
      requiresInitialSave: false,
    });

    await insertNewSlideIntoCurrentPresentation();

    expect(useEditorStore.getState().requiresInitialSave).toBe(false);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });
});
