import { describe, it, expect } from 'vitest';
import { normalizePresentation } from '@/utils/backgrounds';
import { CONTENT_FIELDS, hasDiverged, presentationContentKey } from '@/utils/presentationVersions';

// Plan A5 slice 1. The content key is the single definition of "this document
// changed" — autosave, the dirty-on-open decision and captureVersion's
// idempotency all rest on it, so it is tested harder than anything else here.

function presentation(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: 'Sunday Morning',
    sections: [
      {
        id: 'sec-1',
        type: 'announcement',
        title: 'Slides',
        slides: [{ id: 'slide-1', type: 'text', body: 'Welcome' }],
      },
    ],
    aspectRatio: '16:9',
    customAspectWidth: null,
    customAspectHeight: null,
    created_at: 1000,
    updated_at: 2000,
    ...overrides,
  };
}

describe('presentationContentKey', () => {
  it('covers every field in CONTENT_FIELDS', () => {
    // Quantifier guard: if CONTENT_FIELDS is ever emptied, this must fail loudly
    // rather than pass vacuously over an empty loop.
    expect(CONTENT_FIELDS.length).toBeGreaterThan(0);
    const key = presentationContentKey(presentation());
    for (const field of CONTENT_FIELDS) {
      expect(key).toContain(field);
    }
  });

  it('ignores updated_at, which touchPresentation bumps on every open', () => {
    expect(presentationContentKey(presentation({ updated_at: 999_999 }))).toBe(
      presentationContentKey(presentation())
    );
  });

  it('ignores id and created_at', () => {
    expect(presentationContentKey(presentation({ id: 41, created_at: 5 }))).toBe(
      presentationContentKey(presentation())
    );
  });

  it('reads snake_case columns so a DB row and its in-memory twin agree', () => {
    const row = {
      id: 7,
      title: 'Sunday Morning',
      sections: presentation().sections,
      aspect_ratio: '4:3',
      custom_aspect_width: 1024,
      custom_aspect_height: 768,
    };
    const inMemory = presentation({
      aspectRatio: '4:3',
      customAspectWidth: 1024,
      customAspectHeight: 768,
    });
    expect(presentationContentKey(row)).toBe(presentationContentKey(inMemory));
  });

  it('changes when sections change', () => {
    const edited = presentation();
    edited.sections[0]!.slides.push({ id: 'slide-2', type: 'text', body: 'Second' });
    expect(presentationContentKey(edited)).not.toBe(presentationContentKey(presentation()));
  });

  it('changes when the title changes', () => {
    expect(presentationContentKey(presentation({ title: 'Evening' }))).not.toBe(
      presentationContentKey(presentation())
    );
  });

  it('returns the empty-document key for null rather than throwing', () => {
    expect(presentationContentKey(null)).toBe(presentationContentKey(undefined));
    expect(typeof presentationContentKey(null)).toBe('string');
  });
});

describe('hasDiverged', () => {
  it('takes a snapshot, not a content key, and is false against its own snapshot', () => {
    const p = normalizePresentation(presentation());
    expect(hasDiverged(p, null)).toBe(false);
    expect(hasDiverged(p, JSON.stringify(p))).toBe(false);

    const other = normalizePresentation(presentation({ title: 'Evening' }));
    expect(hasDiverged(p, JSON.stringify(other))).toBe(true);
  });

  it('is false for an unparseable snapshot rather than marking the document dirty', () => {
    expect(hasDiverged(normalizePresentation(presentation()), '{not json')).toBe(false);
  });
});

describe('presentationContentKey key-order canonicalization (SAVE-B12)', () => {
  // The content object is rebuilt field-by-field from CONTENT_FIELDS, so its
  // OWN top-level key order never varies. The bug lives one level down: the
  // `sections` array is copied through as-is, so a section or slide object
  // whose keys were inserted in a different order produced a different
  // JSON.stringify() string for an otherwise identical document.
  it('produces the same key for two deep-equal documents whose nested objects have different key insertion order', () => {
    const a = presentation({
      sections: [
        {
          id: 'sec-1',
          type: 'announcement',
          title: 'Slides',
          slides: [
            { id: 'slide-1', type: 'text', body: 'Welcome' },
            { id: 'slide-2', type: 'text', body: 'Second' },
          ],
        },
      ],
    });
    const b = presentation({
      sections: [
        {
          // Every key present, same values, reverse insertion order.
          slides: [
            { body: 'Welcome', type: 'text', id: 'slide-1' },
            { body: 'Second', type: 'text', id: 'slide-2' },
          ],
          title: 'Slides',
          type: 'announcement',
          id: 'sec-1',
        },
      ],
    });
    expect(presentationContentKey(a)).toBe(presentationContentKey(b));
  });

  it('still differs when the documents truly differ, key order aside', () => {
    const a = presentation({
      sections: [{ id: 'sec-1', type: 'announcement', title: 'Slides', slides: [] }],
    });
    const b = presentation({
      // Reversed key order AND a real content difference (title).
      sections: [{ slides: [], title: 'Different', type: 'announcement', id: 'sec-1' }],
    });
    expect(presentationContentKey(a)).not.toBe(presentationContentKey(b));
  });

  it('preserves array element order — reordering slides is a real difference, not noise', () => {
    const forward = presentation({
      sections: [
        {
          id: 'sec-1',
          type: 'announcement',
          title: 'Slides',
          slides: [
            { id: 'slide-1', type: 'text', body: 'First' },
            { id: 'slide-2', type: 'text', body: 'Second' },
          ],
        },
      ],
    });
    const reversed = presentation({
      sections: [
        {
          id: 'sec-1',
          type: 'announcement',
          title: 'Slides',
          slides: [
            { id: 'slide-2', type: 'text', body: 'Second' },
            { id: 'slide-1', type: 'text', body: 'First' },
          ],
        },
      ],
    });
    expect(presentationContentKey(forward)).not.toBe(presentationContentKey(reversed));
  });
});

describe('content key determinism', () => {
  // normalizeTextBox mints uuid() for an id-less box at index > 0 and
  // legacyTextBoxId mints one for an id-less slide (textBoxes.js:120,147), so a
  // FIRST normalization of legacy content is non-deterministic. The key must
  // still be stable once normalized, and stable across a JSON round trip —
  // otherwise a document is permanently dirty and autosave never stops.
  const legacy = {
    id: 9,
    title: 'Legacy',
    aspectRatio: '16:9',
    sections: [
      {
        id: 'sec-legacy',
        type: 'song',
        title: 'Hymn',
        slides: [{ body: 'no slide id here' }, { body: 'nor here' }],
      },
    ],
  };

  it('is stable under repeated normalization', () => {
    const once = normalizePresentation(legacy);
    expect(presentationContentKey(normalizePresentation(once))).toBe(presentationContentKey(once));
  });

  it('is stable across a JSON round trip, which is how a snapshot is stored', () => {
    const once = normalizePresentation(legacy);
    const roundTripped = JSON.parse(JSON.stringify(once));
    expect(presentationContentKey(roundTripped)).toBe(presentationContentKey(once));
    expect(hasDiverged(once, JSON.stringify(once))).toBe(false);
  });
});
