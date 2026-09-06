// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collapseAll, useCollapsedSections } from '@/hooks/useCollapsedSections';

// Plan D2 #9 — the filmstrip's collapsed map. Pins the behaviour the effect
// it replaces had: all collapsed per presentation, reset only when the
// presentation id changes.

const A = [{ id: 'a1' }, { id: 'a2' }];
const B = [{ id: 'b1' }];

describe('collapseAll', () => {
  it('maps every section id to true, and nothing for no sections', () => {
    expect(collapseAll(A)).toEqual({ a1: true, a2: true });
    expect(collapseAll([])).toEqual({});
    expect(collapseAll(undefined)).toEqual({});
  });
});

describe('useCollapsedSections', () => {
  it('starts with every section collapsed', () => {
    const { result } = renderHook(() => useCollapsedSections(1, A));
    expect(result.current[0]).toEqual({ a1: true, a2: true });
  });

  it('accepts a function updater and a plain map', () => {
    const { result } = renderHook(() => useCollapsedSections(1, A));
    act(() => result.current[1]((m) => ({ ...m, a1: !m.a1 })));
    expect(result.current[0]).toEqual({ a1: false, a2: true });
    act(() => result.current[1]({ a1: false, a2: false }));
    expect(result.current[0]).toEqual({ a1: false, a2: false });
  });

  it('resets to all-collapsed when the presentation id changes, in the same render', () => {
    const { result, rerender } = renderHook(
      ({ id, sections }) => useCollapsedSections(id, sections),
      { initialProps: { id: 1 as number | null, sections: A } }
    );
    act(() => result.current[1]({ a1: false, a2: false }));
    rerender({ id: 2, sections: B });
    expect(result.current[0]).toEqual({ b1: true });
  });

  it('keeps the map when sections change under the same presentation id', () => {
    const { result, rerender } = renderHook(
      ({ id, sections }) => useCollapsedSections(id, sections),
      { initialProps: { id: 1, sections: A } }
    );
    act(() => result.current[1]({ a1: false, a2: true }));
    rerender({ id: 1, sections: [...A, { id: 'a3' }] });
    expect(result.current[0]).toEqual({ a1: false, a2: true });
  });

  it('treats an undefined id (presentation not loaded yet) as its own key, then resets on load', () => {
    const { result, rerender } = renderHook(
      ({ id, sections }) => useCollapsedSections(id, sections),
      {
        initialProps: {
          id: undefined as number | undefined,
          sections: [] as Array<{ id: string }>,
        },
      }
    );
    expect(result.current[0]).toEqual({});
    rerender({ id: 7, sections: A });
    expect(result.current[0]).toEqual({ a1: true, a2: true });
  });
});
