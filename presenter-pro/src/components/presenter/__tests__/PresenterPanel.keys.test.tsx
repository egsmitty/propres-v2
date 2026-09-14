// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L0 — characterization of the presenter panel's keyboard advance BEFORE
// any live-safety fix. → and Space send the next slide live, ← the previous,
// both ends are bounded, and typing in a field never moves the projector.
// The clicker keys (PageDown/PageUp) and the dialog guard are added by later
// plans with their own red tests; nothing here should change for them.
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
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

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
    { id: 's2', type: 'sermon', backgroundId: null, slides: [{ id: 'c', body: 'C' }] },
  ],
});

function presentFrom(slideId: string, sectionId = slideId === 'c' ? 's2' : 's1') {
  usePresenterStore.setState({
    isPresenting: true,
    liveSectionId: sectionId,
    liveSlideId: slideId,
    allSlides: flattenPresentationSlides(PRESENTATION),
    presenterPanelOpen: true,
  });
}

function sentIds(): string[] {
  return vi.mocked(sendSlide).mock.calls.map((call) => (call[0] as { id: string }).id);
}

async function press(init: { key: string; code?: string }) {
  await act(async () => {
    fireEvent.keyDown(window, init);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  window.localStorage.clear();
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
  // jsdom implements no layout, so it has no scrollIntoView. The panel scrolls
  // the live thumbnail into view on every live change; that is a measurement
  // seam (testing-standards.mdc), not behaviour under test here.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('PresenterPanel keyboard while presenting', () => {
  it('→ sends the next slide live', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'ArrowRight' });

    await waitFor(() => expect(sentIds()).toEqual(['b']));
    expect(usePresenterStore.getState().liveSlideId).toBe('b');
  });

  it('Space advances like →, across a section boundary', async () => {
    presentFrom('b');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: ' ', code: 'Space' });

    await waitFor(() => expect(sentIds()).toEqual(['c']));
    expect(usePresenterStore.getState().liveSectionId).toBe('s2');
    expect(usePresenterStore.getState().liveSlideId).toBe('c');
  });

  it('← sends the previous slide live', async () => {
    presentFrom('b');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'ArrowLeft' });

    await waitFor(() => expect(sentIds()).toEqual(['a']));
    expect(usePresenterStore.getState().liveSlideId).toBe('a');
  });

  it('→ on the last slide sends nothing', async () => {
    presentFrom('c');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'ArrowRight' });

    expect(sendSlide).not.toHaveBeenCalled();
    expect(usePresenterStore.getState().liveSlideId).toBe('c');
  });

  it('← on the first slide sends nothing', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'ArrowLeft' });

    expect(sendSlide).not.toHaveBeenCalled();
    expect(usePresenterStore.getState().liveSlideId).toBe('a');
  });

  it('never advances while the user is typing in a text field', async () => {
    presentFrom('a');
    render(<PresenterPanel onSetOpen={undefined} />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    await press({ key: 'ArrowRight' });
    await press({ key: ' ', code: 'Space' });

    expect(sendSlide).not.toHaveBeenCalled();
    expect(usePresenterStore.getState().liveSlideId).toBe('a');
  });
});

describe('PresenterPanel keyboard while NOT presenting', () => {
  it('→ does not send anything to the output', async () => {
    usePresenterStore.setState({ presenterPanelOpen: true, isPresenting: false });
    render(<PresenterPanel onSetOpen={undefined} />);

    await press({ key: 'ArrowRight' });

    expect(sendSlide).not.toHaveBeenCalled();
  });
});
