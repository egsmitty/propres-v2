// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan L4 (audit LIVE-A4, FS-2). The session sync looked the live slide up by
// its section AND its id. Moving the live slide into another section (Move to
// Section…, or a drag) made the lookup miss, so every later edit to that slide
// stopped reaching the projector. Slide ids are unique; the live slide is now
// found by id alone, and its section is updated to where it now lives.
//
// L0's presenterFlow.test.ts pins "a deleted live slide is not refreshed",
// which must still pass.
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

import { syncPresentationSession } from '@/utils/presenterFlow';
import { refreshLiveSlide, setPresentationSessionSlides } from '@/utils/ipc';
import { usePresenterStore } from '@/store/presenterStore';

const PRESENTER_INITIAL = usePresenterStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  vi.mocked(setPresentationSessionSlides).mockResolvedValue({ success: true });
  vi.mocked(refreshLiveSlide).mockResolvedValue({ success: true });
});

describe('syncPresentationSession — the live slide moved to another section', () => {
  it('still refreshes it, and records its new section', async () => {
    // "b" was live in s1; the operator moved it into s2 and edited it.
    usePresenterStore.setState({ isPresenting: true, liveSectionId: 's1', liveSlideId: 'b' });
    const moved = {
      id: 'p1',
      aspectRatio: '16:9',
      sections: [
        { id: 's1', backgroundId: null, slides: [{ id: 'a', backgroundId: null, body: 'A' }] },
        {
          id: 's2',
          backgroundId: null,
          slides: [
            { id: 'b', backgroundId: null, body: 'B, moved and edited' },
            { id: 'c', backgroundId: null, body: 'C' },
          ],
        },
      ],
    };

    await expect(syncPresentationSession(moved)).resolves.toBe(true);

    expect(refreshLiveSlide).toHaveBeenCalledTimes(1);
    const refreshed = vi.mocked(refreshLiveSlide).mock.calls[0]?.[0] as {
      id: string;
      sectionId: string;
      body: string;
    };
    expect(refreshed.id).toBe('b');
    expect(refreshed.sectionId).toBe('s2');
    expect(refreshed.body).toBe('B, moved and edited');
    expect(usePresenterStore.getState().liveSectionId).toBe('s2');
    expect(usePresenterStore.getState().liveSlideId).toBe('b');
  });
});
