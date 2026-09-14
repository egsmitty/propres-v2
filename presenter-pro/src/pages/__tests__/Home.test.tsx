// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// Plan H1 (audit HOME-9, HOME-11). `Home.jsx` renders a presentation row with
// `onClick` and — before this plan — also `onDoubleClick`. A real double-click
// dispatches click, click, dblclick, which called `onOpen` three times. The
// row's Pin/More action buttons were also only reachable by mouse hover (or
// selection/menu state); a keyboard user tabbing onto the row could never see
// them.
//
// `sections: []` on the fixture keeps `PresentationPreview` on its no-slide
// branch, which skips `SlideRender` — that component measures itself via
// `ResizeObserver`, absent from `vitest.setup.mjs`; without one it renders its
// stage hidden (plan ED36).

vi.mock('@/utils/ipc', () => ({
  getPresentations: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock('@/utils/presentationCommands', () => ({
  createNewPresentation: vi.fn(),
  createPresentationFromTemplate: vi.fn(),
  deletePresentationById: vi.fn(),
  openPresentationInEditor: vi.fn(),
  renamePresentationById: vi.fn(),
}));

import { getPresentations, getProfile } from '@/utils/ipc';
import { openPresentationInEditor } from '@/utils/presentationCommands';
import { useAppStore } from '@/store/appStore';
import Home from '@/pages/Home';

const INITIAL_APP_STATE = useAppStore.getState();

const PRESENTATION = {
  id: 'p1',
  title: 'Sunday Morning Service',
  updated_at: 1_700_000_000,
  sections: [],
};

beforeEach(() => {
  useAppStore.setState(INITIAL_APP_STATE, true);
  vi.clearAllMocks();
  vi.mocked(getPresentations).mockResolvedValue({ success: true, data: [PRESENTATION] });
  vi.mocked(getProfile).mockResolvedValue({ success: true, data: null });
  vi.mocked(openPresentationInEditor).mockResolvedValue(undefined);
});

async function renderHomeWithRow() {
  render(<Home />);
  return screen.findByRole('button', { name: /Sunday Morning Service/ });
}

describe('Home presentation row — opens once (HOME-9)', () => {
  it('calls openPresentationInEditor exactly once for click, click, dblclick', async () => {
    const row = await renderHomeWithRow();

    // What a real double-click actually dispatches in the browser.
    fireEvent.click(row);
    fireEvent.click(row);
    fireEvent.doubleClick(row);

    // Exact count matters: this is the bug (three concurrent opens), not
    // "opened at least once".
    expect(openPresentationInEditor).toHaveBeenCalledTimes(1);
  });
});

describe('Home presentation row — actions reachable by keyboard focus (HOME-11)', () => {
  it('shows Pin and More actions when focus is within the row', async () => {
    const row = await renderHomeWithRow();

    act(() => {
      row.focus();
    });

    expect(screen.getByRole('button', { name: /Pin presentation/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });
});
