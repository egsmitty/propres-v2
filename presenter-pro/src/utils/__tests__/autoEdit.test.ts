import { describe, it, expect } from 'vitest';
import { resolveSelectionEditing } from '@/utils/autoEdit';

// Plan D2 slice 4 (#7/#8). When a slide becomes selected, the editor decides
// whether to drop straight into text editing: only for a slide with exactly
// one text box that is still empty, and only when the selection was not
// flagged as "just inserted" (a freshly inserted slide is selected, not edited).

const box = (id: string, body = '') => ({ id, body, x: 0, y: 0, width: 10, height: 10 });
const presentation = (slides: Array<Record<string, unknown>>) => ({
  sections: [{ id: 'sec', type: 'song', slides }],
});

describe('resolveSelectionEditing', () => {
  it('enters editing on an empty single-text-box slide, selecting that box', () => {
    const p = presentation([{ id: 'sl', textBoxes: [box('b1')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'sl', { suppress: false })).toEqual({
      editingSlideId: 'sl',
      selectedTextBoxIds: ['b1'],
    });
  });

  it('with suppression: selects the box but does not edit', () => {
    const p = presentation([{ id: 'sl', textBoxes: [box('b1')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'sl', { suppress: true })).toEqual({
      editingSlideId: null,
      selectedTextBoxIds: ['b1'],
    });
  });

  it('does nothing for a slide whose only box has text', () => {
    const p = presentation([{ id: 'sl', textBoxes: [box('b1', 'Amazing grace')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'sl', { suppress: false })).toEqual({
      editingSlideId: null,
      selectedTextBoxIds: [],
    });
  });

  it('does nothing for a slide with two boxes, even if both are empty', () => {
    const p = presentation([{ id: 'sl', textBoxes: [box('b1'), box('b2')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'sl', { suppress: false })).toEqual({
      editingSlideId: null,
      selectedTextBoxIds: [],
    });
  });

  it('does nothing for a media slide', () => {
    const p = presentation([{ id: 'sl', type: 'media', mediaId: 4, textBoxes: [box('b1')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'sl', { suppress: false })).toEqual({
      editingSlideId: null,
      selectedTextBoxIds: [],
    });
  });

  it('does nothing when the slide cannot be found', () => {
    const p = presentation([{ id: 'sl', textBoxes: [box('b1')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'nope', { suppress: false })).toEqual({
      editingSlideId: null,
      selectedTextBoxIds: [],
    });
    expect(resolveSelectionEditing(null, 'sec', 'sl', { suppress: false })).toEqual({
      editingSlideId: null,
      selectedTextBoxIds: [],
    });
  });

  it('treats whitespace-only text as empty (the old Canvas rule)', () => {
    const p = presentation([{ id: 'sl', textBoxes: [box('b1', '   \n ')] }]);
    expect(resolveSelectionEditing(p, 'sec', 'sl', { suppress: false }).editingSlideId).toBe('sl');
  });
});
