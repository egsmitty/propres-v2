// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L1 (audit LIVE-A11 / CMD-B2). The Editor stops a live presentation on
// Escape from a window keydown listener it registers when it mounts. Every
// overlay registers its own Escape listener LATER, so it ran AFTER the Editor's
// — even overlays that called preventDefault() were too late, and closing a
// dialog, menu or settings sheet also took the projector down.
//
// Each case registers a window listener BEFORE the overlay mounts (exactly the
// Editor's position) and asserts it sees Escape already consumed. This table is
// exhaustive for the overlays that handle Escape; its length is asserted.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  getElectronPlatform: () => 'darwin',
  listVersionSummaries: vi.fn(async () => ({ success: true, data: [] })),
  closeOutputWindow: vi.fn(async () => ({ success: true })),
  closeStageDisplayWindow: vi.fn(async () => ({ success: true })),
  getPreviewWindowState: vi.fn(async () => ({
    success: true,
    data: { outputOpen: false, stageOpen: false },
  })),
  getSettings: vi.fn(async () => ({ success: true, data: {} })),
  getSystemDisplays: vi.fn(async () => ({ success: true, data: [] })),
  onPreviewWindowClosed: vi.fn(() => () => {}),
  onPreviewWindowState: vi.fn(() => () => {}),
  openOutputWindow: vi.fn(async () => ({ success: true })),
  openStageDisplayWindow: vi.fn(async () => ({ success: true })),
  setSetting: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/utils/presentationVersionsSync', () => ({ restoreVersion: vi.fn() }));

import DialogHost from '@/components/shared/Dialog';
import ShortcutsOverlay from '@/components/shared/ShortcutsOverlay';
import ContextMenu from '@/components/shared/ContextMenu';
import MenuBar from '@/components/layout/MenuBar';
import PresentationSettingsModal from '@/components/editor/PresentationSettingsModal';
import VersionHistoryModal from '@/components/editor/VersionHistoryModal';
import OutputSettingsModal from '@/components/editor/OutputSettingsModal';
import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';
import { useEditorStore } from '@/store/editorStore';

const APP_INITIAL = useAppStore.getState();
const DIALOG_INITIAL = useDialogStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();

let seen: boolean[] = [];
function editorLikeListener(e: KeyboardEvent) {
  if (e.key === 'Escape') seen.push(e.defaultPrevented);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  useDialogStore.setState(DIALOG_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  useEditorStore
    .getState()
    .setPresentation({ id: 'p1', title: 'T', aspectRatio: '16:9', sections: [] });
  seen = [];
  // Registered BEFORE any overlay mounts — the Editor's position.
  window.addEventListener('keydown', editorLikeListener);
});

afterEach(() => {
  window.removeEventListener('keydown', editorLikeListener);
});

function pressEscape() {
  fireEvent.keyDown(document.body, { key: 'Escape' });
}

type Case = { name: string; mount: () => void; closed: () => Promise<void> | void };

const CASES: Case[] = [
  {
    name: 'a dialog',
    mount: () => {
      const resolve = vi.fn();
      useDialogStore.getState().show({
        title: 'Confirm',
        description: 'Sure?',
        actions: [
          { label: 'Cancel', value: false, cancel: true },
          { label: 'OK', value: true, primary: true },
        ],
        resolve,
      });
      render(<DialogHost />);
    },
    closed: () => {
      const dialog = useDialogStore.getState().dialog as { resolve: ReturnType<typeof vi.fn> };
      expect(dialog.resolve).toHaveBeenCalledTimes(1);
    },
  },
  {
    name: 'the keyboard shortcuts sheet',
    mount: () => {
      render(<ShortcutsOverlay onClose={onCloseShortcuts} />);
    },
    closed: () => {
      expect(onCloseShortcuts).toHaveBeenCalledTimes(1);
    },
  },
  {
    name: 'a context menu',
    mount: () => {
      render(
        <ContextMenu
          x={10}
          y={10}
          items={[{ label: 'Item', onClick: vi.fn() }]}
          onClose={onCloseMenu}
        />
      );
    },
    closed: () => {
      expect(onCloseMenu).toHaveBeenCalledTimes(1);
    },
  },
  {
    name: 'an open menu-bar menu',
    mount: () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByRole('button', { name: /^View$/ }));
      expect(screen.getByRole('button', { name: /^Song Library/ })).toBeInTheDocument();
    },
    closed: () => {
      expect(screen.queryByRole('button', { name: /^Song Library/ })).toBeNull();
    },
  },
  {
    name: 'Presentation Settings',
    mount: () => {
      useAppStore.setState({ presentationSettingsOpen: true });
      render(<PresentationSettingsModal />);
    },
    closed: () => {
      expect(useAppStore.getState().presentationSettingsOpen).toBe(false);
    },
  },
  {
    name: 'Version History',
    mount: () => {
      useAppStore.setState({ versionHistoryOpen: true });
      render(<VersionHistoryModal />);
    },
    closed: () => {
      expect(useAppStore.getState().versionHistoryOpen).toBe(false);
    },
  },
  {
    name: 'Output Settings',
    mount: () => {
      useAppStore.setState({ outputSettingsOpen: true });
      render(<OutputSettingsModal />);
    },
    closed: async () => {
      await waitFor(() => expect(useAppStore.getState().outputSettingsOpen).toBe(false));
    },
  },
];

const onCloseShortcuts = vi.fn();
const onCloseMenu = vi.fn();

describe('an overlay consumes Escape before the Editor sees it', () => {
  it('covers all 7 overlays that handle Escape', () => {
    expect(CASES).toHaveLength(7);
  });

  for (const testCase of CASES) {
    it(`${testCase.name} closes and consumes Escape`, async () => {
      testCase.mount();
      pressEscape();
      expect(seen).toEqual([true]);
      await testCase.closed();
    });
  }
});

describe('Escape that no overlay wants still reaches the Editor', () => {
  it('a menu bar with no menu open does not consume Escape', () => {
    render(<MenuBar />);
    pressEscape();
    expect(seen).toEqual([false]);
  });
});
