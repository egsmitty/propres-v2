// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L2 (audit LIVE-C1, CMD-B10, LIVE-B12). A presentation clicker sends
// PageDown / PageUp, and the panel ignored both, so a volunteer's remote did
// nothing. Space on a focused dialog button, or ↓ in a focused <select>, moved
// the projector instead. L0's PresenterPanel.keys.test.tsx pins →, ← and Space
// and must still pass unchanged.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  getMedia: vi.fn(),
  sendBlack: vi.fn(),
  sendLogo: vi.fn(),
  sendSlide: vi.fn(),
}));
vi.mock('@/utils/presenterFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/presenterFlow')>()),
  startSidebarPresentationSession: vi.fn(),
  stopPresentationSession: vi.fn(),
}));

import PresenterPanel from '@/components/presenter/PresenterPanel';
import { getMedia, sendSlide } from '@/utils/ipc';
import { flattenPresentationSlides } from '@/utils/presenterFlow';
import { normalizePresentation } from '@/utils/backgrounds';
import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

const APP_INITIAL = useAppStore.getState();
const DIALOG_INITIAL = useDialogStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();

const PRESENTATION = normalizePresentation({
  id: 'p1',
  aspectRatio: '16:9',
  sections: [
    {
      id: 's1',
      type: 'announcement',
      backgroundId: null,
      slides: [
        { id: 'a', body: 'A' },
        { id: 'b', body: 'B' },
      ],
    },
    {
      id: 's2',
      type: 'sermon',
      backgroundId: null,
      slides: [
        { id: 'c', body: 'C' },
        { id: 'd', body: 'D' },
      ],
    },
  ],
});
const SECTION_OF: Record<string, string> = { a: 's1', b: 's1', c: 's2', d: 's2' };

function presentFrom(slideId: string) {
  usePresenterStore.setState({
    isPresenting: true,
    liveSectionId: SECTION_OF[slideId],
    liveSlideId: slideId,
    allSlides: flattenPresentationSlides(PRESENTATION),
    presenterPanelOpen: true,
  });
}

function sentIds(): string[] {
  return vi.mocked(sendSlide).mock.calls.map((call) => (call[0] as { id: string }).id);
}

async function press(init: { key: string; code?: string; metaKey?: boolean }) {
  await act(async () => {
    fireEvent.keyDown(window, init);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  window.localStorage.clear();
  useAppStore.setState(APP_INITIAL, true);
  useDialogStore.setState(DIALOG_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  useEditorStore.setState({
    presentation: PRESENTATION,
    selectedSectionId: 's1',
    selectedSlideId: 'a',
  });
  vi.mocked(getMedia).mockResolvedValue({ success: true, data: [] });
  vi.mocked(sendSlide).mockResolvedValue({ success: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  // jsdom has no layout, so no scrollIntoView — a measurement seam, as in L0.
  Element.prototype.scrollIntoView = vi.fn();
});

type Move = [key: { key: string; code?: string }, from: string, to: string];

const MOVES: Move[] = [
  [{ key: 'PageDown' }, 'b', 'c'],
  [{ key: 'ArrowDown' }, 'a', 'b'],
  [{ key: 'Enter' }, 'a', 'b'],
  [{ key: 'n' }, 'a', 'b'],
  [{ key: 'PageUp' }, 'c', 'b'],
  [{ key: 'ArrowUp' }, 'b', 'a'],
  [{ key: 'Backspace' }, 'b', 'a'],
  [{ key: 'p' }, 'b', 'a'],
  [{ key: 'Home' }, 'c', 'a'],
  [{ key: 'End' }, 'b', 'd'],
];

describe('PresenterPanel — clicker and PowerPoint Slide Show keys', () => {
  it('covers all 10 moves', () => {
    expect(MOVES).toHaveLength(10);
  });

  for (const [key, from, to] of MOVES) {
    it(`${key.key} from ${from} sends ${to} live`, async () => {
      presentFrom(from);
      render(<PresenterPanel onSetOpen={undefined} />);

      await press(key);

      await waitFor(() => expect(sentIds()).toEqual([to]));
      expect(usePresenterStore.getState().liveSlideId).toBe(to);
    });
  }

  it('Home on the first slide and End on the last send nothing', async () => {
    presentFrom('a');
    const { unmount } = render(<PresenterPanel onSetOpen={undefined} />);
    await press({ key: 'Home' });
    unmount();

    presentFrom('d');
    render(<PresenterPanel onSetOpen={undefined} />);
    await press({ key: 'End' });

    expect(sendSlide).not.toHaveBeenCalled();
  });

  it('a modifier-held key never moves the slide', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'PageDown', metaKey: true });

    expect(sendSlide).not.toHaveBeenCalled();
  });
});

describe('PresenterPanel — keys meant for something else stay put', () => {
  it('Space while a dialog is showing does not move the projector', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);
    useDialogStore.setState({
      dialog: { title: 'Still Presenting', actions: [], resolve: () => {} },
    });

    await press({ key: ' ', code: 'Space' });

    expect(sendSlide).not.toHaveBeenCalled();
    expect(usePresenterStore.getState().liveSlideId).toBe('a');
  });

  it('↓ in a focused <select> does not move the projector', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);
    const select = document.createElement('select');
    select.innerHTML = '<option>one</option><option>two</option>';
    document.body.appendChild(select);
    select.focus();
    expect(document.activeElement).toBe(select);

    await press({ key: 'ArrowDown' });

    expect(sendSlide).not.toHaveBeenCalled();
  });

  it('B and . are not slide moves (black is the Editor’s job)', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'b' });
    await press({ key: '.' });

    expect(sendSlide).not.toHaveBeenCalled();
  });
});
