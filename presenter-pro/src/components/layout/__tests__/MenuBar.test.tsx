// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/utils/appCommands', () => ({ runAppCommand: vi.fn() }));

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

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
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
