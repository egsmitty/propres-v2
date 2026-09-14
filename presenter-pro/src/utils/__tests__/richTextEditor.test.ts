// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { clearEditorFormatting } from '@/utils/richTextEditor';

// ED-6 (fable-pass-2-audit.md, Part 3). `clearEditorFormatting` used to
// collapse the whole selection into one `Text` node via
// `selection.toString()` / `range.cloneContents().textContent`, discarding any
// `<br>` or block element inside it — two lyric lines became one. These tests
// build a real contenteditable, select its contents with a real Range, and
// assert the DOM shape left behind: exact node counts/order, never a
// stringified re-join. If an assertion fails, the bug is elsewhere — never
// loosen the assertion to pass. Fix the root cause or record it as a
// suspected regression.

function buildEditor(html: string): HTMLDivElement {
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return editor;
}

function selectAllContents(editor: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('clearEditorFormatting', () => {
  it('strips formatting from a <br>-separated two-line selection but keeps the line break', () => {
    const editor = buildEditor('<b>Line one</b><br><b>Line two</b>');
    selectAllContents(editor);

    const result = clearEditorFormatting(editor);

    expect(result).toBe(true);
    // Formatting is gone.
    expect(editor.querySelectorAll('b')).toHaveLength(0);
    // Exactly one line break survives — not zero (the bug), not more than one.
    const breaks = editor.querySelectorAll('br');
    expect(breaks).toHaveLength(1);
    // Order and content matter: read each line off the <br>'s siblings rather
    // than re-splitting the joined string, so a reordering would fail here.
    // The length-1 assertion above guarantees this element exists.
    const br = breaks[0] as Element;
    expect(br.previousSibling?.textContent).toBe('Line one');
    expect(br.nextSibling?.textContent).toBe('Line two');
    expect(editor.textContent).toBe('Line oneLine two');
  });

  it('strips formatting from a <div>-per-line selection and keeps both lines as separate blocks', () => {
    const editor = buildEditor('<div><b>Line one</b></div><div><b>Line two</b></div>');
    selectAllContents(editor);

    const result = clearEditorFormatting(editor);

    expect(result).toBe(true);
    expect(editor.querySelectorAll('b')).toHaveLength(0);
    const divs = editor.querySelectorAll('div');
    // Exact count and order: two blocks, not one joined block.
    expect(divs).toHaveLength(2);
    // The length-2 assertion above guarantees both elements exist.
    expect((divs[0] as Element).textContent).toBe('Line one');
    expect((divs[1] as Element).textContent).toBe('Line two');
  });

  it('removes formatting from a single-line selection without inventing a line break', () => {
    const editor = buildEditor('<b>only bold</b>');
    selectAllContents(editor);

    const result = clearEditorFormatting(editor);

    expect(result).toBe(true);
    expect(editor.querySelectorAll('b')).toHaveLength(0);
    expect(editor.querySelectorAll('br')).toHaveLength(0);
    expect(editor.textContent).toBe('only bold');
  });

  it('returns false and changes nothing when there is no selection to clear', () => {
    const editor = buildEditor('<b>untouched</b>');
    // Collapse the selection to a single point instead of selecting a range.
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = clearEditorFormatting(editor);

    expect(result).toBe(false);
    expect(editor.innerHTML).toBe('<b>untouched</b>');
  });
});
