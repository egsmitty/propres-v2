import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Plan D1 (audit SAVE-A10, SAVE-A11). Autosave must never fail silently.
//
// - SAVE-A10: after three failed writes it alerts — once per open document,
//   forever. A success reset the failure count but not the "already alerted"
//   flag, so a second run of failures later in the session said nothing.
// - SAVE-A11: a write whose IPC call REJECTS (rather than returning
//   `{ success: false }`) escaped the failure counting entirely, as an
//   unhandled rejection.
//
// autosaveSync.test.ts (plan A5) pins the success paths and must pass unchanged.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  updatePresentation: vi.fn(),
  writeVersion: vi.fn(),
  getLatestVersion: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));

import { updatePresentation } from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { useEditorStore } from '@/store/editorStore';
import { AUTOSAVE_DEBOUNCE_MS } from '@/utils/autosave';
import {
  AUTOSAVE_FAILURE_ALERT_THRESHOLD,
  cancelPendingAutosave,
  startAutosave,
} from '@/utils/autosaveSync';

const INITIAL_STATE = useEditorStore.getState();

const PRESENTATION = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Hi' }] },
  ],
  aspectRatio: '16:9',
};

function edited(body: string) {
  return {
    ...PRESENTATION,
    sections: [{ ...PRESENTATION.sections[0]!, slides: [{ id: 's1', body }] }],
  };
}

let stop: (() => void) | null = null;
let edits = 0;

async function editAndSettle() {
  edits += 1;
  useEditorStore.setState({ presentation: edited(`edit ${edits}`), isDirty: true });
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 50);
}

function couldNotSaveAlerts(): number {
  return vi
    .mocked(alertDialog)
    .mock.calls.filter((call) => (call[1] as { title?: string })?.title === 'Could Not Save')
    .length;
}

beforeEach(() => {
  vi.useFakeTimers();
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
  vi.mocked(alertDialog).mockResolvedValue(undefined);
  edits = 0;
  useEditorStore.setState({ presentation: PRESENTATION, presentationId: 7 });
  stop = startAutosave();
});

afterEach(() => {
  stop?.();
  stop = null;
  cancelPendingAutosave();
  vi.useRealTimers();
});

describe('autosave failure alerts', () => {
  it('alerts again for a second run of failures after a success (SAVE-A10)', async () => {
    expect(AUTOSAVE_FAILURE_ALERT_THRESHOLD).toBe(3);

    vi.mocked(updatePresentation).mockResolvedValue({ success: false, error: 'disk full' });
    for (let i = 0; i < AUTOSAVE_FAILURE_ALERT_THRESHOLD; i += 1) await editAndSettle();
    expect(couldNotSaveAlerts()).toBe(1);

    vi.mocked(updatePresentation).mockResolvedValue({ success: true, data: PRESENTATION });
    await editAndSettle();
    expect(couldNotSaveAlerts()).toBe(1);

    vi.mocked(updatePresentation).mockResolvedValue({ success: false, error: 'disk full' });
    for (let i = 0; i < AUTOSAVE_FAILURE_ALERT_THRESHOLD; i += 1) await editAndSettle();
    expect(couldNotSaveAlerts()).toBe(2);
  });

  it('counts a write that throws as a failure, and alerts (SAVE-A11)', async () => {
    vi.mocked(updatePresentation).mockRejectedValue(new Error('An object could not be cloned.'));

    for (let i = 0; i < AUTOSAVE_FAILURE_ALERT_THRESHOLD; i += 1) await editAndSettle();

    expect(updatePresentation).toHaveBeenCalledTimes(AUTOSAVE_FAILURE_ALERT_THRESHOLD);
    expect(couldNotSaveAlerts()).toBe(1);
    const message = String(vi.mocked(alertDialog).mock.calls[0]?.[0]);
    expect(message).toContain('An object could not be cloned.');
  });
});
