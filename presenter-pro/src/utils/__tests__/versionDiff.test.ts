import { describe, it, expect } from 'vitest';
import { diffPresentationStructure } from '@/utils/versionDiff';

// Plan VH2/VH3 (issues #160, #163). The diff reads as the CONSEQUENCE of
// restoring the version onto the current document: `added` = you would get it
// back, `removed` = you would LOSE it, `changed` = same id, different content —
// and for a changed slide, WHICH aspect and a literal before/after of its text.
// Baseline is the current (live) document; target is the version.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

type Slide = Record<string, unknown>;
type Section = Record<string, unknown>;

function slide(id: string, over: Slide = {}): Slide {
  return {
    id,
    label: 'Slide',
    body: `<p>${id}</p>`,
    notes: '',
    backgroundId: null,
    textStyle: { fontSize: 48 },
    textBoxes: [{ id: `tb-${id}`, body: `<p>${id}</p>` }],
    ...over,
  };
}
function section(id: string, slides: Slide[], over: Section = {}): Section {
  return {
    id,
    title: `Sec ${id}`,
    type: 'announcement',
    color: '#111111',
    collapsed: false,
    backgroundId: null,
    slides,
    ...over,
  };
}
function doc(sections: Section[], over: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: 'Sunday',
    aspectRatio: '16:9',
    customAspectWidth: null,
    customAspectHeight: null,
    sections,
    ...over,
  };
}
const ZERO = {
  slidesAdded: 0,
  slidesRemoved: 0,
  slidesChanged: 0,
  sectionsAdded: 0,
  sectionsRemoved: 0,
  backgroundsChanged: 0,
  titleChanged: false,
  titleBefore: 'Sunday',
  titleAfter: 'Sunday',
  aspectChanged: false,
};

describe('diffPresentationStructure', () => {
  it('identical documents: every node same, nothing counted (whole object)', () => {
    const a = doc([section('A', [slide('s1'), slide('s2')])]);
    expect(diffPresentationStructure(a, structuredClone(a))).toEqual({
      summary: ZERO,
      tree: [
        {
          id: 'A',
          title: 'Sec A',
          type: 'announcement',
          status: 'same',
          slides: [
            { id: 's1', name: 'Slide', preview: 's1', status: 'same' },
            { id: 's2', name: 'Slide', preview: 's2', status: 'same' },
          ],
        },
      ],
    });
  });

  it('a slide only in the version is `added`, carrying the text you would get', () => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1'), slide('s2', { body: '<p>New words</p>' })])]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({ ...ZERO, slidesAdded: 1 });
    expect(out.tree[0]!.status).toBe('changed');
    expect(out.tree[0]!.slides[1]).toEqual({
      id: 's2',
      name: 'Slide',
      preview: 'New words',
      status: 'added',
      after: 'New words',
    });
  });

  it('a slide only in the current document is `removed`, listed in place with the text you would lose', () => {
    const current = doc([section('A', [slide('s1'), slide('s2', { body: '<p>Keep me</p>' })])]);
    const version = doc([section('A', [slide('s1')])]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({ ...ZERO, slidesRemoved: 1 });
    expect(out.tree[0]!.slides.map((s) => [s.id, s.status])).toEqual([
      ['s1', 'same'],
      ['s2', 'removed'],
    ]);
    expect(out.tree[0]!.slides[1]!.before).toBe('Keep me');
  });

  it('a changed slide names the aspect and gives a literal before/after of its text', () => {
    const current = doc([section('A', [slide('s1', { body: '<p>Amazing <b>grace</b></p>' })])]);
    const version = doc([
      section('A', [
        slide('s1', {
          body: '<p>Amazing grace, how sweet</p>',
          textBoxes: [{ id: 'tb-s1', body: '<p>Amazing grace, how sweet</p>' }],
        }),
      ]),
    ]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({ ...ZERO, slidesChanged: 1 });
    expect(out.tree[0]!.slides[0]).toEqual({
      id: 's1',
      name: 'Slide',
      preview: 'Amazing grace, how sweet',
      status: 'changed',
      changes: ['text'],
      before: 'Amazing grace',
      after: 'Amazing grace, how sweet',
    });
  });

  it.each([
    [
      'formatting',
      { body: '<p><b>s1</b></p>', textBoxes: [{ id: 'tb-s1', body: '<p><b>s1</b></p>' }] },
      ['formatting'],
    ],
    ['layout', { textBoxes: [{ id: 'tb-s1', body: '<p>s1</p>', x: 10 }] }, ['layout']],
    ['layout', { textStyle: { fontSize: 72 } }, ['layout']],
    ['notes', { notes: 'a note' }, ['notes']],
    ['background', { backgroundId: 42 }, ['background']],
    ['label', { label: 'Chorus' }, ['label']],
  ])('a slide whose %s differs is `changed` with that aspect', (_what, over, changes) => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1', over)])]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary.slidesChanged).toBe(1);
    expect(out.tree[0]!.slides[0]!.status).toBe('changed');
    expect(out.tree[0]!.slides[0]!.changes).toEqual(changes);
    expect(out.tree[0]!.status).toBe('changed');
  });

  it('a slide background change is also counted as a background change', () => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1', { backgroundId: 42 })])]);
    expect(diffPresentationStructure(current, version).summary).toEqual({
      ...ZERO,
      slidesChanged: 1,
      backgroundsChanged: 1,
    });
  });

  it('reordered slides: the section is `changed` for `order`, the slides themselves `same`', () => {
    const current = doc([section('A', [slide('s1'), slide('s2')])]);
    const version = doc([section('A', [slide('s2'), slide('s1')])]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual(ZERO);
    expect(out.tree[0]!.status).toBe('changed');
    expect(out.tree[0]!.changes).toEqual(['order']);
    expect(out.tree[0]!.slides.map((s) => [s.id, s.status])).toEqual([
      ['s2', 'same'],
      ['s1', 'same'],
    ]);
  });

  it('a renamed section reports `title`; a section background change reports `background` and counts', () => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1')], { title: 'Opening', backgroundId: 9 })]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({ ...ZERO, backgroundsChanged: 1 });
    expect(out.tree[0]!.status).toBe('changed');
    expect(out.tree[0]!.changes).toEqual(['title', 'background']);
    expect(out.tree[0]!.title).toBe('Opening');
  });

  it('a section only in the version is `added` with every slide `added`', () => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1')]), section('B', [slide('b1'), slide('b2')])]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({ ...ZERO, sectionsAdded: 1, slidesAdded: 2 });
    expect(out.tree.map((s) => [s.id, s.status])).toEqual([
      ['A', 'same'],
      ['B', 'added'],
    ]);
    expect(out.tree[1]!.slides.every((s) => s.status === 'added')).toBe(true);
  });

  it('a section only in the current document is appended as `removed` with its slides `removed`', () => {
    const current = doc([section('A', [slide('s1')]), section('B', [slide('b1'), slide('b2')])]);
    const version = doc([section('A', [slide('s1')])]);
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({ ...ZERO, sectionsRemoved: 1, slidesRemoved: 2 });
    expect(out.tree.map((s) => [s.id, s.status])).toEqual([
      ['A', 'same'],
      ['B', 'removed'],
    ]);
    expect(out.tree[1]!.slides.every((s) => s.status === 'removed')).toBe(true);
  });

  it.each([
    ['collapsed', { collapsed: true }],
    ['color', { color: '#ff0000' }],
  ])('a section whose %s differs is NOT a content change', (_what, over) => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1')], over)]);
    expect(diffPresentationStructure(current, version).summary).toEqual(ZERO);
    expect(diffPresentationStructure(current, version).tree[0]!.status).toBe('same');
  });

  it('a slide whose placeholderText or legacy textBox differs is NOT a content change', () => {
    const current = doc([section('A', [slide('s1', { placeholderText: 'a', textBox: { x: 1 } })])]);
    const version = doc([section('A', [slide('s1', { placeholderText: 'b', textBox: { x: 2 } })])]);
    expect(diffPresentationStructure(current, version).summary).toEqual(ZERO);
  });

  it('a legacy body-only snapshot compares by body against a text-boxes document', () => {
    const current = doc([section('A', [slide('s1')])]);
    const legacy = slide('s1');
    delete legacy.textBoxes;
    const version = doc([section('A', [legacy])]);
    expect(diffPresentationStructure(current, version).summary).toEqual(ZERO);
  });

  it('reports a title change with its before/after, and an aspect change, without touching the tree', () => {
    const current = doc([section('A', [slide('s1')])]);
    const version = doc([section('A', [slide('s1')])], { title: 'Easter', aspectRatio: '4:3' });
    const out = diffPresentationStructure(current, version);
    expect(out.summary).toEqual({
      ...ZERO,
      titleChanged: true,
      titleBefore: 'Sunday',
      titleAfter: 'Easter',
      aspectChanged: true,
    });
    expect(out.tree[0]!.status).toBe('same');
  });

  it('caps before/after text at 160 characters, and the preview at 40', () => {
    const long = 'x'.repeat(200);
    const current = doc([section('A', [slide('s1', { body: `<p>${long}</p>` })])]);
    const version = doc([section('A', [slide('s1', { body: '<p>short</p>' })])]);
    const s = diffPresentationStructure(current, version).tree[0]!.slides[0]!;
    expect(s.before).toBe(`${'x'.repeat(159)}…`);
    expect(s.after).toBe('short');
    expect(s.preview).toBe('short');
  });

  it('names a slide by its label, previews the first line of its body stripped of tags, capped at 40', () => {
    const long = 'x'.repeat(60);
    const current = doc([
      section('A', [
        slide('s1', { label: 'Verse 1', body: `<p>Amazing grace</p><p>second line</p>` }),
        slide('s2', { label: '', body: `<p>${long}</p>` }),
        slide('s3', { label: '', body: '' }),
      ]),
    ]);
    const out = diffPresentationStructure(current, structuredClone(current));
    expect(out.tree[0]!.slides.map((s) => [s.name, s.preview])).toEqual([
      ['Verse 1', 'Amazing grace'],
      [`${'x'.repeat(39)}…`, `${'x'.repeat(39)}…`],
      ['Untitled slide', ''],
    ]);
  });
});
