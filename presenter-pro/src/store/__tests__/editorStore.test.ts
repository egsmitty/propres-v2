import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/editorStore';

// The editor store is a module singleton, so state leaks between tests unless
// it is restored. Capture the pristine state once at import time and replace
// (not merge) it before each test — a merge would leave prior mutations behind.
const INITIAL_STATE = useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(INITIAL_STATE, true);
});

const presentationFixture = () => ({
  id: 'pres-1',
  title: 'Sunday Morning',
  aspectRatio: '16:9',
  sections: [
    {
      id: 'sec-1',
      type: 'song',
      backgroundId: null,
      slides: [
        { id: 'sl-1', body: 'first' },
        { id: 'sl-2', body: 'second' },
      ],
    },
  ],
});

describe('setPresentation', () => {
  it('normalizes the presentation and records its id', () => {
    useEditorStore.getState().setPresentation(presentationFixture());
    const state = useEditorStore.getState();

    expect(state.presentationId).toBe('pres-1');
    // Structural floor: a normalizer that empties its input must fail here.
    expect(state.presentation?.sections).toHaveLength(1);
    expect(state.presentation?.sections[0].slides).toHaveLength(2);
  });

  it('clears every selection field so stale selections cannot survive a load', () => {
    useEditorStore.getState().setSlideSelection('old-sec', 'old-slide', ['old-slide']);
    useEditorStore.getState().setSelectedTextBoxIds(['tb-1']);

    useEditorStore.getState().setPresentation(presentationFixture());
    const state = useEditorStore.getState();

    // All five selection fields, not a sample of them.
    expect(state.selectedSectionId).toBeNull();
    expect(state.selectedSlideId).toBeNull();
    expect(state.selectedSlideIds).toEqual([]);
    expect(state.selectedTextBoxIds).toEqual([]);
    expect(state.suppressAutoEditSlideId).toBeNull();
  });

  it('records a null id when the presentation has none', () => {
    useEditorStore.getState().setPresentation({ sections: [] });
    expect(useEditorStore.getState().presentationId).toBeNull();
  });
});

describe('selection', () => {
  it('setSelectedSlide selects one slide and clears the multi-selection', () => {
    useEditorStore.getState().setSelectedSlideIds(['sl-1', 'sl-2']);
    useEditorStore.getState().setSelectedSlide('sec-1', 'sl-2');
    const state = useEditorStore.getState();

    expect(state.selectedSectionId).toBe('sec-1');
    expect(state.selectedSlideId).toBe('sl-2');
    expect(state.selectedSlideIds).toEqual([]);
    expect(state.selectedTextBoxIds).toEqual([]);
    // Selecting a different slide must never leave the old one in edit mode.
    expect(state.editingSlideId).toBeNull();
  });

  it('setSlideSelection keeps an explicit multi-selection', () => {
    useEditorStore.getState().setSlideSelection('sec-1', 'sl-1', ['sl-1', 'sl-2']);
    const state = useEditorStore.getState();

    expect(state.selectedSlideId).toBe('sl-1');
    // Order and count both matter — this drives shift-click range behavior.
    expect(state.selectedSlideIds).toEqual(['sl-1', 'sl-2']);
  });

  it('defaults the multi-selection to empty when none is passed', () => {
    useEditorStore.getState().setSlideSelection('sec-1', 'sl-1');
    expect(useEditorStore.getState().selectedSlideIds).toEqual([]);
  });
});

describe('undo and redo', () => {
  it('are no-ops when there is no history', () => {
    const before = useEditorStore.getState().presentation;
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().presentation).toBe(before);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().presentation).toBe(before);
  });

  it('restores the previous slide body and marks the document dirty', () => {
    const store = useEditorStore.getState();
    store.setPresentation(presentationFixture());
    store.setSelectedSlide('sec-1', 'sl-1');

    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edited');
    expect(useEditorStore.getState().presentation.sections[0].slides[0].body).toBe('edited');

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().presentation.sections[0].slides[0].body).toBe('first');
    // Undo is itself an unsaved change.
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('round-trips an edit through undo and redo', () => {
    const store = useEditorStore.getState();
    store.setPresentation(presentationFixture());
    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edited');

    useEditorStore.getState().undo();
    useEditorStore.getState().redo();

    expect(useEditorStore.getState().presentation.sections[0].slides[0].body).toBe('edited');
  });

  it('moves one entry between the past and future stacks per undo', () => {
    const store = useEditorStore.getState();
    store.setPresentation(presentationFixture());
    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edit one');

    const pastDepth = useEditorStore.getState().past.length;
    expect(pastDepth).toBeGreaterThan(0);
    expect(useEditorStore.getState().future).toHaveLength(0);

    useEditorStore.getState().undo();

    // Depth is asserted, not just contents, so an off-by-one push fails here.
    expect(useEditorStore.getState().past).toHaveLength(pastDepth - 1);
    expect(useEditorStore.getState().future).toHaveLength(1);
  });

  it('drops the redo stack once a new edit is made after undoing', () => {
    const store = useEditorStore.getState();
    store.setPresentation(presentationFixture());
    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edit one');
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().future).toHaveLength(1);

    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'edit two');

    // A new branch of history invalidates the old redo path.
    expect(useEditorStore.getState().future).toHaveLength(0);
  });
});

describe('dirty tracking', () => {
  it('starts clean and flips on edit', () => {
    useEditorStore.getState().setPresentation(presentationFixture());
    expect(useEditorStore.getState().isDirty).toBe(false);

    useEditorStore.getState().updateSlideBody('sec-1', 'sl-1', 'changed');
    // This flag is what drives the unsaved-changes warning on quit.
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('can be set explicitly after a save', () => {
    useEditorStore.getState().setDirty(true);
    useEditorStore.getState().setDirty(false);
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});
