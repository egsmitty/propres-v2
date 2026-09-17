// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/utils/appCommands', () => ({ runAppCommand: vi.fn() }));

import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import MenuBar from '@/components/layout/MenuBar';

// Plan A5 slice 1. "Revert to Last Save" is destructive and irreversible until
// a version-history panel exists, so the in-app menu must not offer it when
// there is nothing to revert to.

const INITIAL_STATE = useEditorStore.getState();

const PRESENTATION = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    { id: 'sec-1', type: 'announcement', title: 'Slides', slides: [{ id: 's1', body: 'Hi' }] },
  ],
};

function openFileMenu() {
  render(<MenuBar />);
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
}

function revertItem(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Revert to Last Save/ }) as HTMLButtonElement;
}

const APP_INITIAL = useAppStore.getState();

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  useAppStore.setState(APP_INITIAL, true);
  // Every case here describes the editor's menu bar. Since plan CMDS1 the
  // menu reads the command registry, whose editor-only rules also require
  // the editor view (audit CMD-B4), so the view is part of the seed state.
  useAppStore.setState({ currentView: 'editor' });
  vi.clearAllMocks();
});

describe('File ▸ Version History…', () => {
  function historyItem(): HTMLButtonElement {
    return screen.getByRole('button', { name: /Version History/ }) as HTMLButtonElement;
  }

  it('is available with a presentation open and more than one version', () => {
    // Plan VH1 (issue #159): needs a second version to have something to restore.
    useEditorStore.setState({ presentation: PRESENTATION, versionCount: 2 });
    openFileMenu();
    expect(historyItem()).toBeEnabled();
  });

  it('is disabled with only one version — nothing earlier to restore (VH1)', () => {
    useEditorStore.setState({ presentation: PRESENTATION, versionCount: 1 });
    openFileMenu();
    expect(historyItem()).toBeDisabled();
  });

  it('is disabled with no presentation open', () => {
    openFileMenu();
    expect(historyItem()).toBeDisabled();
  });

  it('is disabled while presenting', async () => {
    // Restoring mid-service replaces the presentation; if the live slide is not
    // in the restored document, the next spacebar jumps to slide 1 in front of
    // the room. versionCount is set so presenting is the only reason it's off.
    const { usePresenterStore } = await import('@/store/presenterStore');
    useEditorStore.setState({ presentation: PRESENTATION, versionCount: 2 });
    act(() => usePresenterStore.setState({ isPresenting: true }));
    openFileMenu();
    expect(historyItem()).toBeDisabled();
    act(() => usePresenterStore.setState({ isPresenting: false }));
  });
});

describe('File ▸ Revert to Last Save', () => {
  it('appears in the File menu', () => {
    useEditorStore.setState({ presentation: PRESENTATION, isDirty: true });
    openFileMenu();
    expect(revertItem()).toBeInTheDocument();
  });

  it('is disabled with no presentation open', () => {
    openFileMenu();
    expect(revertItem()).toBeDisabled();
  });

  it('is disabled when the document has no unsaved changes', () => {
    useEditorStore.setState({ presentation: PRESENTATION, isDirty: false });
    openFileMenu();
    expect(revertItem()).toBeDisabled();
  });

  it('is disabled on a never-saved presentation, and enabled once it has been saved', () => {
    useEditorStore.setState({
      presentation: PRESENTATION,
      isDirty: true,
      requiresInitialSave: true,
    });
    openFileMenu();
    // Nothing to revert TO: the first save has not happened yet.
    expect(revertItem()).toBeDisabled();

    // A store write outside act() does not flush the re-render in React 19.
    act(() => useEditorStore.setState({ requiresInitialSave: false }));
    expect(revertItem()).toBeEnabled();
  });
});

// Plan CMDS1, Todo 5: the whole menu bar, pinned BEFORE it is generated from
// the command registry. Every menu, every row, in order, with its shortcut
// text; a divider is '---'. Written against the hand-listed MENUS and kept
// green by the registry — except the one deliberate change named in Todo 6.
describe('every menu, every row, in order (plan CMDS1 pin)', () => {
  type Row = '---' | [label: string, shortcut: string];

  function openMenu(name: string): Row[] {
    fireEvent.click(screen.getByRole('button', { name }));
    const dropdown = document.querySelector('.absolute.top-full');
    if (!dropdown) throw new Error(`the ${name} menu did not open`);
    const rows = Array.from(dropdown.children).map((child): Row => {
      if (child.tagName !== 'BUTTON') return '---';
      const spans = child.querySelectorAll('span');
      return [spans[0]?.textContent ?? '', spans[1]?.textContent ?? ''];
    });
    fireEvent.click(screen.getByRole('button', { name }));
    return rows;
  }

  it('for a clean, saved, open presentation', () => {
    useEditorStore.setState({ presentation: PRESENTATION, isDirty: false });
    render(<MenuBar />);
    const menus = ['File', 'Insert', 'Present', 'Edit', 'View', 'Help'].map((name) => [
      name,
      openMenu(name),
    ]);
    expect(menus).toEqual([
      [
        'File',
        [
          ['New Presentation', 'Ctrl+N'],
          ['Open…', 'Ctrl+O'],
          ['Save', 'Ctrl+S'],
          ['Save As…', 'Ctrl+Shift+S'],
          ['Revert to Last Save', ''],
          ['Version History…', ''],
          '---',
          // The one deliberate change (plan CMDS1 Todo 6): Close now shows
          // the ⌘W / Ctrl+W the native menu always had.
          ['Close', 'Ctrl+W'],
        ],
      ],
      [
        'Insert',
        [
          ['New Slide', 'Ctrl+M'],
          '---',
          ['Song', ''],
          ['Media', ''],
          ['Announcement', ''],
          ['Sermon', ''],
        ],
      ],
      [
        'Present',
        [
          ['Start Presenting', 'F5'],
          ['Stop Presenting', 'Esc'],
          '---',
          ['Black Screen', 'B'],
          ['Logo Screen', 'L'],
        ],
      ],
      [
        'Edit',
        [
          ['Presentation Settings…', ''],
          ['Output Settings…', ''],
        ],
      ],
      [
        'View',
        [
          ['Hide Service Order', ''],
          ['Song Library', ''],
          ['Media Library', ''],
          ['Show Presenter Panel', ''],
        ],
      ],
      [
        'Help',
        [
          ['Show Tutorial', ''],
          ['Keyboard Shortcuts', '?'],
          ['About PresenterPro', ''],
        ],
      ],
    ]);
  });
});
