// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildNativeMenuTemplate } from '../../../electron/main/nativeMenu';
import { COMMANDS, nativeCommands } from '@/utils/commandRegistry';

// Plan CMDS1, Decision 7. Electron builds the native menu once from its own
// template, so that template still spells labels and accelerators itself.
// This test holds it to the registry: the same commands (both directions,
// counted), the same labels, and hints for exactly the renderer-owned keys.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

function templateItems() {
  const template = buildNativeMenuTemplate({ isDev: false, sendCommand: () => {} });
  return template.flatMap((top) => top.submenu ?? []).filter((item) => item.click);
}

describe('the native template and the registry describe the same commands', () => {
  it('the ids are the same set, both directions, 21 each', () => {
    const templateIds = templateItems().map((item) => item.id);
    const registryIds = nativeCommands();
    expect(templateIds).toHaveLength(21);
    expect(registryIds).toHaveLength(21);
    expect([...templateIds].sort()).toEqual([...registryIds].sort());
  });

  it('every template item carries the registry label for its command', () => {
    const labels = templateItems().map((item) => [item.id, item.label]);
    const expected = templateItems().map((item) => {
      const def = COMMANDS.find((c) => c.id === item.id);
      return [item.id, def?.nativeLabel ?? def?.label ?? '(not in registry)'];
    });
    expect(labels).toEqual(expected);
  });

  it('the hint commands are exactly the template items not registered with the OS', () => {
    const unregistered = templateItems()
      .filter((item) => item.registerAccelerator === false)
      .map((item) => item.id);
    expect(unregistered).toEqual(COMMANDS.filter((c) => c.hint).map((c) => c.id));
  });
});
