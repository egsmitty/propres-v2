// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Plan L0 — characterization of the presenting flow BEFORE any live-safety fix
// (audit `fable-pass-2-audit.md` Wave 1). These pin the behaviour every later
// fix must preserve: which slide goes live on start, that stop tears the
// session down, that a live slide is sent with its inherited background and the
// presentation's aspect ratio, and that an edit mid-session refreshes the live
// slide by its id. Each known live-safety BUG gets its own red test in the PR
// that fixes it, so nothing here should need to change for those fixes.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  openOutputWindow: vi.fn(),
  openStageDisplayWindow: vi.fn(),
  refreshLiveSlide: vi.fn(),
  sendSlide: vi.fn(),
  setPresentationSessionSlides: vi.fn(),
  stopPresenting: vi.fn(),
  waitForOutputReady: vi.fn(),
  waitForStageDisplayReady: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  alertDialog: vi.fn(),
  confirmDialog: vi.fn(),
  showDialog: vi.fn(),
  promptDialog: vi.fn(),
}));

import {
  flattenPresentationSlides,
  sendSlideLive,
  startSidebarPresentationSession,
  stopPresentationSession,
  syncPresentationSession,
} from '@/utils/presenterFlow';
import {
  openOutputWindow,
  openStageDisplayWindow,
  refreshLiveSlide,
  sendSlide,
  setPresentationSessionSlides,
  stopPresenting,
  waitForOutputReady,
  waitForStageDisplayReady,
} from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();

type Slide = { id: string; backgroundId?: number | null; body?: string };
type Section = { id: string; backgroundId: number | null; slides: Slide[] };
type Presentation = {
  id: string;
  aspectRatio?: string;
  customAspectWidth?: number | null;
  customAspectHeight?: number | null;
  sections: Section[];
};

function fixture(): Presentation {
  return {
    id: 'p1',
    aspectRatio: '4:3',
    customAspectWidth: null,
    customAspectHeight: null,
    sections: [
      {
        id: 's1',
        backgroundId: 7,
        slides: [
          { id: 'a', backgroundId: null, body: 'A' },
          { id: 'b', backgroundId: 9, body: 'B' },
        ],
      },
      { id: 's2', backgroundId: null, slides: [{ id: 'c', backgroundId: null, body: 'C' }] },
    ],
  };
}

function firstCallArg(mock: unknown): { id?: string; [key: string]: unknown } {
  const calls = vi.mocked(mock as (...args: unknown[]) => unknown).mock.calls;
  return (calls[0]?.[0] ?? {}) as { id?: string; [key: string]: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  usePresenterStore.setState({ presenterPanelOpen: false });

  vi.mocked(openOutputWindow).mockResolvedValue({ success: true });
  vi.mocked(waitForOutputReady).mockResolvedValue({ success: true });
  vi.mocked(openStageDisplayWindow).mockResolvedValue({ success: true, data: { opened: false } });
  vi.mocked(waitForStageDisplayReady).mockResolvedValue({ success: true });
  vi.mocked(setPresentationSessionSlides).mockResolvedValue({ success: true });
  vi.mocked(sendSlide).mockResolvedValue({ success: true });
  vi.mocked(refreshLiveSlide).mockResolvedValue({ success: true });
  vi.mocked(stopPresenting).mockResolvedValue({ success: true });
  vi.mocked(alertDialog).mockResolvedValue(undefined);
  // jsdom does not implement window.focus(); starting a session calls it to
  // give the presenter keyboard somewhere to land. Not behaviour under test.
  vi.spyOn(window, 'focus').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('flattenPresentationSlides', () => {
  it('returns [] when there is no presentation', () => {
    expect(flattenPresentationSlides(null)).toEqual([]);
  });

  it('lists every slide in section order, with its section, inherited background and the presentation ratio', () => {
    const slides = flattenPresentationSlides(fixture());
    // Exact: order, count and content all matter.
    expect(slides.map((s: Slide & { sectionId: string }) => [s.sectionId, s.id])).toEqual([
      ['s1', 'a'],
      ['s1', 'b'],
      ['s2', 'c'],
    ]);
    // a inherits its section's 7, b's own 9 wins, c has none.
    expect(
      slides.map((s: { effectiveBackgroundId: number | null }) => s.effectiveBackgroundId)
    ).toEqual([7, 9, null]);
    expect(slides.map((s: { aspectRatio: string }) => s.aspectRatio)).toEqual([
      '4:3',
      '4:3',
      '4:3',
    ]);
  });

  it('defaults the ratio to 16:9 when the presentation has none', () => {
    const { aspectRatio: _unused, ...rest } = fixture();
    const slides = flattenPresentationSlides(rest);
    expect(slides.map((s: { aspectRatio: string }) => s.aspectRatio)).toEqual([
      '16:9',
      '16:9',
      '16:9',
    ]);
  });
});

describe('startSidebarPresentationSession', () => {
  it('refuses a presentation with no slides and opens nothing', async () => {
    const empty: Presentation = {
      id: 'p2',
      sections: [{ id: 's1', backgroundId: null, slides: [] }],
    };

    await expect(startSidebarPresentationSession(empty)).resolves.toBe(false);

    expect(openOutputWindow).not.toHaveBeenCalled();
    expect(sendSlide).not.toHaveBeenCalled();
    expect(usePresenterStore.getState().isPresenting).toBe(false);
  });

  it('starts on the selected slide and records the whole session', async () => {
    const presentation = fixture();
    useEditorStore.setState({ selectedSectionId: 's1', selectedSlideId: 'b' });

    await expect(startSidebarPresentationSession(presentation)).resolves.toBe(true);

    expect(sendSlide).toHaveBeenCalledTimes(1);
    expect(firstCallArg(sendSlide).id).toBe('b');
    expect(vi.mocked(sendSlide).mock.calls[0]?.[1]).toBeNull();

    // Output first, then the session slides, then the first slide.
    const opened = vi.mocked(openOutputWindow).mock.invocationCallOrder[0] ?? 0;
    const sessioned = vi.mocked(setPresentationSessionSlides).mock.invocationCallOrder[0] ?? 0;
    const sent = vi.mocked(sendSlide).mock.invocationCallOrder[0] ?? 0;
    expect(opened).toBeGreaterThan(0);
    expect(opened).toBeLessThan(sessioned);
    expect(sessioned).toBeLessThan(sent);

    const state = usePresenterStore.getState();
    expect(state.isPresenting).toBe(true);
    expect(state.liveSectionId).toBe('s1');
    expect(state.liveSlideId).toBe('b');
    expect(state.isBlack).toBe(false);
    expect(state.isLogo).toBe(false);
    expect(state.presenterPanelOpen).toBe(true);
    expect(state.allSlides.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to the first slide when the selection is not in the presentation', async () => {
    useEditorStore.setState({ selectedSectionId: 's9', selectedSlideId: 'zz' });

    await expect(startSidebarPresentationSession(fixture())).resolves.toBe(true);

    expect(firstCallArg(sendSlide).id).toBe('a');
    expect(usePresenterStore.getState().liveSlideId).toBe('a');
  });

  it('asks main to open the stage display only if one is assigned, and waits for it only when it opened', async () => {
    await startSidebarPresentationSession(fixture());
    expect(openStageDisplayWindow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(openStageDisplayWindow).mock.calls[0]?.[0]).toEqual({ onlyIfAssigned: true });
    expect(waitForStageDisplayReady).not.toHaveBeenCalled();

    vi.clearAllMocks();
    usePresenterStore.setState(PRESENTER_INITIAL, true);
    vi.mocked(openOutputWindow).mockResolvedValue({ success: true });
    vi.mocked(waitForOutputReady).mockResolvedValue({ success: true });
    vi.mocked(openStageDisplayWindow).mockResolvedValue({ success: true, data: { opened: true } });
    vi.mocked(waitForStageDisplayReady).mockResolvedValue({ success: true });

    await startSidebarPresentationSession(fixture());
    expect(waitForStageDisplayReady).toHaveBeenCalledTimes(1);
  });

  it('gives up after 5 seconds when the output window never becomes ready, without going live', async () => {
    vi.useFakeTimers();
    vi.mocked(waitForOutputReady).mockReturnValue(new Promise(() => {}));

    const started = startSidebarPresentationSession(fixture());
    await vi.advanceTimersByTimeAsync(5000);

    await expect(started).resolves.toBe(false);
    expect(alertDialog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(alertDialog).mock.calls[0]?.[1]).toEqual({ title: 'Presentation Failed' });
    expect(sendSlide).not.toHaveBeenCalled();
    expect(usePresenterStore.getState().isPresenting).toBe(false);
  });
});

describe('stopPresentationSession', () => {
  it('tells main to stop and clears the whole session from the store', async () => {
    usePresenterStore.setState({
      isPresenting: true,
      liveSectionId: 's1',
      liveSlideId: 'a',
      isBlack: true,
      allSlides: flattenPresentationSlides(fixture()),
    });

    await stopPresentationSession();

    expect(stopPresenting).toHaveBeenCalledTimes(1);
    const state = usePresenterStore.getState();
    expect(state.isPresenting).toBe(false);
    expect(state.liveSectionId).toBeNull();
    expect(state.liveSlideId).toBeNull();
    expect(state.isBlack).toBe(false);
    expect(state.allSlides).toEqual([]);
  });
});

describe('sendSlideLive', () => {
  it('sends nothing without both a section and a slide', async () => {
    await expect(sendSlideLive(null, { id: 'a' })).resolves.toBe(false);
    await expect(sendSlideLive('s1', null)).resolves.toBe(false);
    expect(sendSlide).not.toHaveBeenCalled();
  });

  it('sends the slide with its section, inherited background and ratio, then marks it live', async () => {
    useEditorStore.setState({ presentation: fixture() });

    await expect(sendSlideLive('s1', { id: 'a', backgroundId: null, body: 'A' })).resolves.toBe(
      true
    );

    expect(sendSlide).toHaveBeenCalledTimes(1);
    const sent = firstCallArg(sendSlide);
    expect(sent.id).toBe('a');
    expect(sent.sectionId).toBe('s1');
    expect(sent.effectiveBackgroundId).toBe(7);
    expect(sent.aspectRatio).toBe('4:3');
    expect(usePresenterStore.getState().liveSectionId).toBe('s1');
    expect(usePresenterStore.getState().liveSlideId).toBe('a');
  });
});

describe('syncPresentationSession', () => {
  it('keeps the panel and main in step, but refreshes nothing when not presenting', async () => {
    await expect(syncPresentationSession(fixture())).resolves.toBe(true);

    expect(usePresenterStore.getState().allSlides.map((s: { id: string }) => s.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(setPresentationSessionSlides).toHaveBeenCalledTimes(1);
    expect(refreshLiveSlide).not.toHaveBeenCalled();
  });

  it('refreshes the live slide with its edited content', async () => {
    usePresenterStore.setState({ isPresenting: true, liveSectionId: 's1', liveSlideId: 'b' });
    const edited = fixture();
    const section = edited.sections[0];
    expect(section).toBeDefined();
    const slide = section?.slides[1];
    expect(slide).toBeDefined();
    if (slide) slide.body = 'B, edited';

    await expect(syncPresentationSession(edited)).resolves.toBe(true);

    expect(refreshLiveSlide).toHaveBeenCalledTimes(1);
    const refreshed = firstCallArg(refreshLiveSlide);
    expect(refreshed.id).toBe('b');
    expect(refreshed.body).toBe('B, edited');
    expect(vi.mocked(refreshLiveSlide).mock.calls[0]?.[1]).toBeNull();
  });

  it('refreshes nothing when the live slide was deleted', async () => {
    usePresenterStore.setState({ isPresenting: true, liveSectionId: 's1', liveSlideId: 'gone' });

    await expect(syncPresentationSession(fixture())).resolves.toBe(true);

    expect(refreshLiveSlide).not.toHaveBeenCalled();
  });
});
