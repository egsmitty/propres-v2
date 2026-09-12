// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/utils/ipc', () => ({ touchPresentation: vi.fn() }));
vi.mock('@/utils/unsavedChanges', () => ({ resolveUnsavedChanges: vi.fn() }));

import { useEditorStore } from '@/store/editorStore';
import { useAppStore } from '@/store/appStore';
import { DEFAULT_NAMES } from '@/utils/nameDraft';
import TitleBar from '@/components/layout/TitleBar';

// Plan G1. Renaming the presentation to nothing used to put the OLD name
// straight back — `renameVal.trim() || presentation.title` — so clearing the
// title was impossible and you were never told why. It now resolves to a
// documented default, visibly, once, on commit.

const EDITOR_INITIAL = useEditorStore.getState();
const APP_INITIAL = useAppStore.getState();

/** Deliberately NOT the default name: a fixture already called "Untitled
 *  Presentation" would hit commitRename's `title !== presentation.title`
 *  no-op branch and pass while proving nothing. */
const PRESENTATION = { id: 9, title: 'Sunday Service', sections: [] };

beforeEach(() => {
  useEditorStore.setState(EDITOR_INITIAL, true);
  useAppStore.setState(APP_INITIAL, true);
  useEditorStore.setState({ presentation: PRESENTATION });
  useAppStore.setState({ currentView: 'editor' });
});

const renameField = () => screen.getByDisplayValue(/./) as HTMLInputElement;

function startRenaming() {
  fireEvent.click(screen.getByText('Rename'));
}

describe('TitleBar rename', () => {
  it('renames to what you typed', () => {
    render(<TitleBar />);
    startRenaming();
    fireEvent.change(renameField(), { target: { value: 'Christmas Eve' } });
    fireEvent.keyDown(renameField(), { key: 'Enter' });

    expect(useEditorStore.getState().presentation.title).toBe('Christmas Eve');
  });

  it('resolves an emptied title to the default instead of reviving the old one', () => {
    render(<TitleBar />);
    startRenaming();
    fireEvent.change(screen.getByDisplayValue('Sunday Service'), { target: { value: '' } });
    fireEvent.keyDown(screen.getByDisplayValue(''), { key: 'Enter' });

    const { title } = useEditorStore.getState().presentation;
    expect(title).toBe(DEFAULT_NAMES.presentation);
    // The actual complaint: the old name came back, forever.
    expect(title).not.toBe('Sunday Service');
  });

  it('marks the presentation dirty without clearing requiresInitialSave', () => {
    // Plan A5 fact 11: setPresentation resets both flags unless told otherwise,
    // and a never-saved presentation that silently becomes "saved" sends
    // Discard down the destructive branch.
    useEditorStore.setState({ requiresInitialSave: true });
    render(<TitleBar />);
    startRenaming();
    fireEvent.change(screen.getByDisplayValue('Sunday Service'), { target: { value: '' } });
    fireEvent.keyDown(screen.getByDisplayValue(''), { key: 'Enter' });

    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(useEditorStore.getState().requiresInitialSave).toBe(true);
  });

  it('Escape abandons the edit and keeps the original name', () => {
    render(<TitleBar />);
    startRenaming();
    fireEvent.change(screen.getByDisplayValue('Sunday Service'), { target: { value: '' } });
    fireEvent.keyDown(screen.getByDisplayValue(''), { key: 'Escape' });

    expect(useEditorStore.getState().presentation.title).toBe('Sunday Service');
  });
});
