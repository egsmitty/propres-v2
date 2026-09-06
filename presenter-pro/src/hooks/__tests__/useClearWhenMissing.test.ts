// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClearWhenMissing } from '@/hooks/useClearWhenMissing';

// Plan D2 #10/#16 — "clear the selection when the selected item is gone".

describe('useClearWhenMissing', () => {
  it('clears when something is selected and it is not present', () => {
    const clear = vi.fn();
    renderHook(() => useClearWhenMissing(5, false, clear));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the selected item is present', () => {
    const clear = vi.fn();
    renderHook(() => useClearWhenMissing(5, true, clear));
    expect(clear).not.toHaveBeenCalled();
  });

  it('does nothing when nothing is selected, present or not', () => {
    const clear = vi.fn();
    renderHook(() => useClearWhenMissing(null, false, clear));
    renderHook(() => useClearWhenMissing(undefined, false, clear));
    expect(clear).not.toHaveBeenCalled();
  });

  it('reacts on a later render when the item disappears', () => {
    const clear = vi.fn();
    const { rerender } = renderHook(({ present }) => useClearWhenMissing(5, present, clear), {
      initialProps: { present: true },
    });
    expect(clear).not.toHaveBeenCalled();
    rerender({ present: false });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
