// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLatest } from '@/hooks/useLatest';

describe('useLatest', () => {
  it('holds the initial value after the first render', () => {
    const { result } = renderHook(() => useLatest('a'));
    expect(result.current.current).toBe('a');
  });

  it('reflects the value of the latest committed render, keeping the same ref object', () => {
    const { result, rerender } = renderHook(({ v }) => useLatest(v), { initialProps: { v: 1 } });
    const ref = result.current;
    rerender({ v: 2 });
    expect(result.current).toBe(ref);
    expect(ref.current).toBe(2);
  });

  it('works for functions: the ref calls the newest closure', () => {
    let seen = 'none';
    const { result, rerender } = renderHook(({ label }) => useLatest(() => (seen = label)), {
      initialProps: { label: 'first' },
    });
    rerender({ label: 'second' });
    result.current.current();
    expect(seen).toBe('second');
  });
});
