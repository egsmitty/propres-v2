import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/presentationCommands', async () => {
  const actual = await vi.importActual<typeof import('@/utils/presentationCommands')>(
    '@/utils/presentationCommands'
  );
  return { ...actual, saveCurrentPresentation: vi.fn() };
});
vi.mock('@/utils/ipc', () => ({ updatePresentation: vi.fn() }));
vi.mock('@/utils/dialog', () => ({ alertDialog: vi.fn() }));

import { saveCurrentPresentation } from '@/utils/presentationCommands';
import { updatePresentation } from '@/utils/ipc';
import { alertDialog } from '@/utils/dialog';
import { saveFromEditor } from '@/pages/editorSave';

// Plan A5, fact 9. `Editor.jsx` had its own `handleSave` that called
// `updatePresentation` directly and then cleared `isDirty` — a seventh write
// path that bypassed `saveCurrentPresentation` entirely. Under this plan that
// would clear the dirty flag WITHOUT capturing a restore point, so Cmd-S in the
// canvas would not be a commit and the document would reopen dirty.
//
// The logic is extracted here so it can be tested without mounting the whole
// editor (Canvas needs measured geometry jsdom cannot produce).

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveFromEditor', () => {
  it('does nothing when there is nothing to save', async () => {
    await saveFromEditor({ presentation: null, isDirty: false, requiresInitialSave: false });
    expect(saveCurrentPresentation).toHaveBeenCalledTimes(0);
  });

  it('delegates to saveCurrentPresentation rather than writing the row itself', async () => {
    vi.mocked(saveCurrentPresentation).mockResolvedValue({ success: true, data: {} });
    await saveFromEditor({ presentation: { id: 7 }, isDirty: true, requiresInitialSave: false });

    expect(saveCurrentPresentation).toHaveBeenCalledTimes(1);
    // The direct write is what made this a bypass; it must be gone.
    expect(updatePresentation).toHaveBeenCalledTimes(0);
  });

  it('does not alert a second time, because saveCurrentPresentation reports failures itself', async () => {
    // BEHAVIOUR CHANGE (plan D1, audit SAVE-A8). This used to pin the editor's
    // own "Save Failed" alert. The alert now lives in saveCurrentPresentation, so
    // File ▸ Save and ⌘S report failures too; alerting here as well would show
    // the same failure twice. Fails on the old code (one alert), passes on the new.
    vi.mocked(saveCurrentPresentation).mockResolvedValue({ success: false, error: 'db locked' });
    await saveFromEditor({ presentation: { id: 7 }, isDirty: true, requiresInitialSave: false });

    expect(alertDialog).toHaveBeenCalledTimes(0);
  });
});
