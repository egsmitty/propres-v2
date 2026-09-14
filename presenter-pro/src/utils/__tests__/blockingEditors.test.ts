import { describe, it, expect, vi, afterEach } from 'vitest';

// Plan D3 (audit SAVE-A1). Editors whose unsaved work lives outside the
// editor store — today only the song editor — register here, so quitting or
// leaving the presentation asks them first instead of dropping their edits.

import { registerBlockingEditor, resolveBlockingEditors } from '@/utils/blockingEditors';

const unregisters: Array<() => void> = [];

function register(
  id: string,
  handlers: { isDirty: () => boolean; resolve: () => Promise<boolean> }
) {
  const unregister = registerBlockingEditor(id, handlers);
  unregisters.push(unregister);
  return unregister;
}

afterEach(() => {
  while (unregisters.length) unregisters.pop()?.();
});

describe('resolveBlockingEditors', () => {
  it('lets the action proceed when nothing is registered', async () => {
    expect(await resolveBlockingEditors()).toBe(true);
  });

  it('does not ask an editor that has no unsaved changes', async () => {
    const resolve = vi.fn().mockResolvedValue(false);
    register('song', { isDirty: () => false, resolve });

    expect(await resolveBlockingEditors()).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('asks a dirty editor and proceeds when it resolves', async () => {
    const resolve = vi.fn().mockResolvedValue(true);
    register('song', { isDirty: () => true, resolve });

    expect(await resolveBlockingEditors()).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('stops the action when a dirty editor declines, and asks no one after it', async () => {
    const first = vi.fn().mockResolvedValue(false);
    const second = vi.fn().mockResolvedValue(true);
    register('a', { isDirty: () => true, resolve: first });
    register('b', { isDirty: () => true, resolve: second });

    expect(await resolveBlockingEditors()).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('forgets an editor once it unregisters', async () => {
    const resolve = vi.fn().mockResolvedValue(false);
    const unregister = register('song', { isDirty: () => true, resolve });

    unregister();

    expect(await resolveBlockingEditors()).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('a stale unregister does not remove a newer editor with the same id', async () => {
    const stale = register('song', {
      isDirty: () => true,
      resolve: vi.fn().mockResolvedValue(true),
    });
    const current = vi.fn().mockResolvedValue(false);
    register('song', { isDirty: () => true, resolve: current });

    stale();

    expect(await resolveBlockingEditors()).toBe(false);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('counts a resolver that throws as declining', async () => {
    register('song', {
      isDirty: () => true,
      resolve: vi.fn().mockRejectedValue(new Error('boom')),
    });

    expect(await resolveBlockingEditors()).toBe(false);
  });
});
