// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

// Plan ED2 (audit ED-1, P0). Typing "Praise & Worship" showed "Praise &amp;
// Worship" on the canvas, the thumbnails and the projector after one edit, and
// one more "amp;" for every edit after that. The editor saves its element's
// innerHTML ("Praise &amp; Worship" — no tags), and slideBodyToHtml escaped
// that already-escaped text again because it saw no tags. The stage display's
// slideBodyToPlainText never decoded entities at all.

import { slideBodyToHtml, slideBodyToPlainText } from '@/utils/slideMarkup';

/**
 * One editor seed/save cycle, exactly as SlideTextEditor does it: seed the
 * contentEditable from the body, then save its innerHTML back as the body.
 */
function seedAndSave(body: string): { body: string; shown: string; element: HTMLElement } {
  const element = document.createElement('div');
  element.innerHTML = slideBodyToHtml(body);
  return { body: element.innerHTML, shown: element.textContent ?? '', element };
}

/** The body the editor saves when someone types `text` into an empty box. */
function typed(text: string): string {
  const element = document.createElement('div');
  element.textContent = text;
  return element.innerHTML;
}

describe('slideBodyToHtml — text survives editing (ED-1)', () => {
  it('shows "Praise & Worship" through three seed/save cycles', () => {
    let body = typed('Praise & Worship');
    const shown: string[] = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const result = seedAndSave(body);
      shown.push(result.shown);
      body = result.body;
    }

    expect(shown).toEqual(['Praise & Worship', 'Praise & Worship', 'Praise & Worship']);
  });

  it('stores the same body after every cycle instead of growing it', () => {
    const first = seedAndSave(typed('Praise & Worship')).body;
    const second = seedAndSave(first).body;
    const third = seedAndSave(second).body;

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('keeps typed angle brackets as text, never markup', () => {
    const { shown, element } = seedAndSave(typed('a <b> c'));

    expect(shown).toBe('a <b> c');
    expect(element.querySelector('b')).toBeNull();
  });

  it('stops already double-encoded text from growing any further', () => {
    const stored = typed('&amp;'); // what one earlier bad cycle left behind: "&amp;amp;"
    const first = seedAndSave(stored).body;
    const second = seedAndSave(first).body;

    expect(second).toBe(first);
  });

  it('still escapes a raw ampersand from seeded or imported text (control)', () => {
    expect(seedAndSave('Rock & Roll').shown).toBe('Rock & Roll');
  });

  it('leaves bodies that contain real markup alone (control)', () => {
    const { shown, element } = seedAndSave('<b>bold</b> &amp; plain');

    expect(element.querySelector('b')?.textContent).toBe('bold');
    expect(shown).toBe('bold & plain');
  });
});

describe('slideBodyToPlainText — the stage display shows characters, not entities (ED-1)', () => {
  it('decodes an escaped ampersand', () => {
    expect(slideBodyToPlainText('Praise &amp; Worship')).toBe('Praise & Worship');
  });

  it('decodes entities inside markup', () => {
    expect(slideBodyToPlainText('<b>Tom &amp; Jerry</b>')).toBe('Tom & Jerry');
  });

  it('decodes angle brackets, quotes and numeric entities', () => {
    expect(slideBodyToPlainText('a &lt;b&gt; &quot;c&quot; it&#39;s &#x27;d&#x27;')).toBe(
      `a <b> "c" it's 'd'`
    );
  });

  it('decodes once, so literal entity text survives (a body that shows "&amp;")', () => {
    expect(slideBodyToPlainText('&amp;amp;')).toBe('&amp;');
  });
});
