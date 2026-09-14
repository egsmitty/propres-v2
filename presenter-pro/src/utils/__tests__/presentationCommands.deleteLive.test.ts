import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan L4 (audit LIVE-A4). Deleting the slide that is on the projector — from
// the filmstrip, the canvas or the toolbar — happened silently mid-service.
// It now asks first, the way the other live-safety guards do. L2 already made
// Backspace / Delete do nothing to slides while presenting; this covers the
// menus and buttons.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

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
  getVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  listVersionSummaries: vi.fn(),
  deleteVersionsFor: vi.fn(),
  listVersions: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  alertDialog: vi.fn(),
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
}));
vi.mock('@/utils/builtInSongSeed', () => ({ ensureBuiltInSongsSeeded: vi.fn() }));

import { confirmDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';
import { deleteSelectedSlideFromCurrentPresentation } from '@/utils/presentationCommands';

const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();

const ROW = {
  id: 7,
  title: 'Sunday Morning',
  aspectRatio: '16:9',
  sections: [
    {
      id: 'sec-1',
      type: 'announcement',
      title: 'Slides',
      slides: [
        { id: 's1', body: 'Live' },
        { id: 's2', body: 'Next' },
      ],
    },
  ],
};

function slideIds(): string[] {
  return useEditorStore
    .getState()
    .presentation.sections.flatMap((section: { slides: { id: string }[] }) =>
      section.slides.map((slide) => slide.id)
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  useEditorStore.getState().setPresentation(ROW);
  useEditorStore.getState().setSelectedSlide('sec-1', 's1');
});

describe('deleting the live slide', () => {
  beforeEach(() => {
    usePresenterStore.setState({ isPresenting: true, liveSectionId: 'sec-1', liveSlideId: 's1' });
  });

  it('asks first, and Cancel keeps the slide', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);

    await expect(deleteSelectedSlideFromCurrentPresentation()).resolves.toBe(false);

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(confirmDialog).mock.calls[0]?.[1]).toMatchObject({
      title: 'Delete Live Slide',
      danger: true,
    });
    expect(slideIds()).toEqual(['s1', 's2']);
  });

  it('deletes it when confirmed', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);

    await expect(deleteSelectedSlideFromCurrentPresentation()).resolves.toBe(true);

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(slideIds()).toEqual(['s2']);
  });

  it('does not ask for a slide that is not live', async () => {
    useEditorStore.getState().setSelectedSlide('sec-1', 's2');

    await expect(deleteSelectedSlideFromCurrentPresentation()).resolves.toBe(true);

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(slideIds()).toEqual(['s1']);
  });
});

describe('deleting a slide when nothing is live', () => {
  it('does not ask', async () => {
    await expect(deleteSelectedSlideFromCurrentPresentation()).resolves.toBe(true);

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(slideIds()).toEqual(['s2']);
  });
});
