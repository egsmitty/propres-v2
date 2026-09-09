import { describe, it, expect } from 'vitest';
import {
  ARG_SHAPERS,
  EVENT_METHODS,
  INVOKE_METHODS,
  SEND_METHODS,
  fail,
  isEnvelope,
  ok,
} from '../ipcContract';

// Plan B1. The contract is the single source of truth for every channel name
// and every `window.electronAPI` method. These tests pin its internal
// consistency; `electron/main/__tests__/ipcChannels.test.ts` pins that main,
// preload and the renderer wrapper all agree with it.

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes].sort();
}

describe('IPC contract tables', () => {
  it('has the measured surface: 52 invoke, 1 send, 12 event methods', () => {
    // Exact counts, not floors: a channel added or removed must be a deliberate
    // edit here, in the same PR as its handler and wrapper.
    expect(Object.keys(INVOKE_METHODS)).toHaveLength(52);
    expect(Object.keys(SEND_METHODS)).toHaveLength(1);
    expect(Object.keys(EVENT_METHODS)).toHaveLength(12);
  });

  it('channel names are unique within each direction', () => {
    expect(duplicates(Object.values(INVOKE_METHODS))).toEqual([]);
    expect(duplicates(Object.values(SEND_METHODS))).toEqual([]);
    expect(duplicates(Object.values(EVENT_METHODS))).toEqual([]);
  });

  it('method names are unique across all three tables', () => {
    expect(
      duplicates([
        ...Object.keys(INVOKE_METHODS),
        ...Object.keys(SEND_METHODS),
        ...Object.keys(EVENT_METHODS),
      ])
    ).toEqual([]);
  });

  it('every channel follows the area:action naming shape', () => {
    const all = [
      ...Object.values(INVOKE_METHODS),
      ...Object.values(SEND_METHODS),
      ...Object.values(EVENT_METHODS),
    ];
    for (const channel of all) expect(channel).toMatch(/^[a-z]+(?::[A-Za-z]+)+$/);
  });

  it('argument shapers exist only for invoke methods and box positional args exactly as before', () => {
    for (const name of Object.keys(ARG_SHAPERS)) expect(INVOKE_METHODS).toHaveProperty(name);
    // All five, byte-identical to the hand-written preload they replace.
    expect(ARG_SHAPERS.pickMedia('video')).toEqual([{ kind: 'video' }]);
    expect(ARG_SHAPERS.sendSlide('S', 'B')).toEqual([{ slide: 'S', background: 'B' }]);
    expect(ARG_SHAPERS.setPresentationSessionSlides(['a'])).toEqual([{ slides: ['a'] }]);
    expect(ARG_SHAPERS.startCountdown(90)).toEqual([{ durationSeconds: 90 }]);
    expect(ARG_SHAPERS.refreshLiveSlide('S', null)).toEqual([{ slide: 'S', background: null }]);
    expect(Object.keys(ARG_SHAPERS).sort()).toEqual([
      'pickMedia',
      'refreshLiveSlide',
      'sendSlide',
      'setPresentationSessionSlides',
      'startCountdown',
    ]);
  });
});

describe('envelope helpers', () => {
  it('ok() and fail() build the two envelope shapes', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 } });
    expect(ok()).toEqual({ success: true });
    expect(fail('boom')).toEqual({ success: false, error: 'boom' });
  });

  it('isEnvelope accepts exactly the envelope shapes', () => {
    expect(isEnvelope({ success: true })).toBe(true);
    expect(isEnvelope({ success: true, data: null })).toBe(true);
    expect(isEnvelope({ success: false, error: 'x' })).toBe(true);
    // Not envelopes: all five.
    expect(isEnvelope(undefined)).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({ data: 1 })).toBe(false);
    expect(isEnvelope({ success: 'yes' })).toBe(false);
    expect(isEnvelope({ success: false })).toBe(false); // failure needs an error string
  });
});
