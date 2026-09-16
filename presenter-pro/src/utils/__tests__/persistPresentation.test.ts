import { describe, it, expect, vi } from 'vitest';
import { normalizePresentation } from '@/utils/backgrounds';
import { persistPresentation, type PersistDeps } from '@/utils/persistPresentation';

// Plan SAVED1. One writer for the `presentations` row. Six call sites used to
// apply their own subset of the same rules; these cases pin the rules once:
// a rejected call is a failure, a failed envelope carries its error verbatim
// (or none — the caller keeps its own fallback), a null row means the
// presentation is gone, the row comes back normalized, and `commit` is the
// caller's capture function whose result the caller sees.
//
// Whole-object equality on purpose. If an assertion fails, the bug is
// elsewhere — never loosen the assertion to pass.

const ROW = { id: 7, title: 'Sunday', sections: [{ id: 's1', slides: [{ id: 'a', body: 'Hi' }] }] };
const DOC = { id: 7, title: 'Sunday', sections: [] };

function deps(
  updatePresentation: PersistDeps['updatePresentation'] = async () => ({
    success: true,
    data: ROW,
  })
): PersistDeps {
  return { updatePresentation: vi.fn(updatePresentation) };
}

describe('persistPresentation', () => {
  it('1. a rejected IPC call is a failure with its message; nothing is committed', async () => {
    const commit = vi.fn(async () => true);
    const d = deps(async () => {
      throw new Error('uncloneable');
    });
    await expect(persistPresentation(7, DOC, { commit, deps: d })).resolves.toEqual({
      ok: false,
      reason: 'failed',
      error: 'uncloneable',
    });
    expect(commit).toHaveBeenCalledTimes(0);
  });

  it('2. a failed envelope carries its error verbatim', async () => {
    const d = deps(async () => ({ success: false, error: 'boom' }));
    await expect(persistPresentation(7, DOC, { deps: d })).resolves.toEqual({
      ok: false,
      reason: 'failed',
      error: 'boom',
    });
  });

  it('3. a failed envelope without an error carries none — the caller keeps its own fallback', async () => {
    const d = deps(async () => ({ success: false }));
    await expect(persistPresentation(7, DOC, { deps: d })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('4. a null envelope is a failure with no error', async () => {
    const d = deps(async () => null);
    await expect(persistPresentation(7, DOC, { deps: d })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('5. a success with no row means the presentation no longer exists; nothing is committed', async () => {
    const commit = vi.fn(async () => true);
    const d = deps(async () => ({ success: true, data: null }));
    await expect(persistPresentation(7, DOC, { commit, deps: d })).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(commit).toHaveBeenCalledTimes(0);
  });

  it('6. a written row comes back normalized; without commit nothing is captured', async () => {
    const d = deps();
    await expect(persistPresentation(7, DOC, { deps: d })).resolves.toEqual({
      ok: true,
      presentation: normalizePresentation(ROW),
      committed: false,
    });
    expect(d.updatePresentation).toHaveBeenCalledTimes(1);
    expect(d.updatePresentation).toHaveBeenCalledWith(7, DOC);
  });

  it('7. commit receives the very object that is returned, once, and its result is reported', async () => {
    const commit = vi.fn(async () => true);
    const outcome = await persistPresentation(7, DOC, { commit, deps: deps() });
    expect(outcome).toEqual({
      ok: true,
      presentation: normalizePresentation(ROW),
      committed: true,
    });
    expect(commit).toHaveBeenCalledTimes(1);
    // Identity, not just equality: the caller may compare it against the store.
    const [received] = commit.mock.calls[0] as unknown as [unknown];
    expect(received).toBe((outcome as { presentation: unknown }).presentation);
  });

  it('8. a failed commit is reported, not hidden: the row is written, committed is false', async () => {
    const commit = vi.fn(async () => false);
    await expect(persistPresentation(7, DOC, { commit, deps: deps() })).resolves.toEqual({
      ok: true,
      presentation: normalizePresentation(ROW),
      committed: false,
    });
  });
});
