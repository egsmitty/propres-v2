// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { beginBodyInteraction, endBodyInteraction } from '@/utils/bodyInteractionStyle';

// Plan D1 #1/#2. Drag interactions on the canvas set a body-wide cursor and
// disable text selection for their duration. Kept in a helper so the React
// Compiler never sees a global mutation inside a component function.

beforeEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe('body interaction style', () => {
  it('begin sets the cursor and disables selection', () => {
    beginBodyInteraction('nwse-resize');
    expect(document.body.style.cursor).toBe('nwse-resize');
    expect(document.body.style.userSelect).toBe('none');
  });

  it('end clears both, back to the stylesheet defaults', () => {
    beginBodyInteraction('move');
    endBodyInteraction();
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('passes the cursor value through untouched', () => {
    beginBodyInteraction('grabbing');
    expect(document.body.style.cursor).toBe('grabbing');
  });
});
