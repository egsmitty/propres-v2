// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setMenuEnabled } from '@/utils/ipc';

// Plan CMDS1 PR B (contract pinning). The renderer's wrapper sends the
// native menu's enabled map over `menu:setEnabled` exactly as given — one
// call, one object — so main can apply it by id.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setMenuEnabled', () => {
  it('forwards the exact payload to the preload bridge once', () => {
    const bridge = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { electronAPI: { setMenuEnabled: bridge } }));

    setMenuEnabled({ enabled: { 'file:save': false, 'present:start': true } });

    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith({
      enabled: { 'file:save': false, 'present:start': true },
    });
  });
});
