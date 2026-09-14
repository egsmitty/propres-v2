// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L4 (audit LIVE-A7, LIVE-A4). Two ways the presenter panel put the wrong
// slide on the projector.
//
// - LIVE-A7: the live index updated only after the IPC round trip and a
//   re-render, so two quick clicker presses both read the old index and sent
//   the same slide twice — an operator double-tapping past a blank slide
//   stayed on it.
// - LIVE-A4: deleting the live slide made its index -1, and "next" then sent
//   slides[0] — slide 1 of the service — to the congregation. The panel now
//   remembers where the live slide was: next shows the slide that took its
//   place, previous the one before it.
//
// L0's PresenterPanel.keys.test.tsx and L2's clicker test must pass unchanged.
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
        { id: 'c', body: 'C' },
        { id: 'd', body: 'D' },
      ],
    },
  ],
});
const ALL = flattenPresentationSlides(PRESENTATION);

function presentFrom(slideId: string) {
  usePresenterStore.setState({
    isPresenting: true,
    liveSectionId: 's1',
    liveSlideId: slideId,
    allSlides: ALL,
    presenterPanelOpen: true,
  });
}

function sentIds(): string[] {
  return vi.mocked(sendSlide).mock.calls.map((call) => (call[0] as { id: string }).id);
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
  Element.prototype.scrollIntoView = vi.fn();
});

describe('PresenterPanel — a double-tap on the clicker', () => {
  it('advances two slides, not the same slide twice', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'PageDown' });
      fireEvent.keyDown(window, { key: 'PageDown' });
    });

    await waitFor(() => expect(sentIds()).toEqual(['b', 'c']));
    expect(usePresenterStore.getState().liveSlideId).toBe('c');
  });
});

describe('PresenterPanel — the live slide was deleted', () => {
  async function deleteLiveSlideB() {
    presentFrom('b');
    render(<PresenterPanel onSetOpen={undefined} />);
    // The operator deletes "b" while it is on the projector: the session's
    // slide list no longer contains it, but it is still the live id.
    await act(async () => {
      usePresenterStore.setState({
        allSlides: ALL.filter((slide: { id: string }) => slide.id !== 'b'),
      });
    });
  }

  it('next goes to the slide that took its place, not to slide 1', async () => {
    await deleteLiveSlideB();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    await waitFor(() => expect(sentIds()).toEqual(['c']));
  });

  it('previous goes to the slide before where it was', async () => {
    await deleteLiveSlideB();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });

    await waitFor(() => expect(sentIds()).toEqual(['a']));
  });
});
