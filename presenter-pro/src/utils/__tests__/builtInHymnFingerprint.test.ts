import { describe, it, expect } from 'vitest';
import { hymnTextFingerprint } from '@/utils/builtInHymnFingerprint';

// The fingerprint must depend on TEXT only. The seeder regenerates every
// group/slide id on each call, so anything that includes ids would differ on
// every launch and the "untouched" check could never succeed.

const groups = (bodies: string[][], type = 'verse') =>
  bodies.map((slideBodies, i) => ({
    id: `g-${Math.random()}`,
    type,
    label: `${type} ${i + 1}`,
    slides: slideBodies.map((body) => ({ id: `s-${Math.random()}`, body })),
  }));

const record = (over: Partial<{ title: string; artist: string; songGroups: unknown }> = {}) => ({
  title: 'Amazing Grace',
  artist: 'John Newton',
  songGroups: JSON.stringify(groups([['Amazing grace\nhow sweet'], ['Twas grace']])),
  ...over,
});

describe('hymnTextFingerprint', () => {
  it('is stable across regenerated ids', () => {
    // Two records with identical text but different random ids.
    expect(hymnTextFingerprint(record())).toBe(hymnTextFingerprint(record()));
  });

  it('accepts songGroups as a JSON string or as an array', () => {
    const asString = record();
    const asArray = { ...asString, songGroups: JSON.parse(asString.songGroups as string) };
    expect(hymnTextFingerprint(asArray)).toBe(hymnTextFingerprint(asString));
  });

  it('changes when a slide body changes', () => {
    const edited = record({
      songGroups: JSON.stringify(groups([['Amazing grace\nhow SWEET'], ['Twas grace']])),
    });
    expect(hymnTextFingerprint(edited)).not.toBe(hymnTextFingerprint(record()));
  });

  it('changes when a group label, group type, or the title changes', () => {
    const base = hymnTextFingerprint(record());
    const relabeled = JSON.parse(record().songGroups as string) as Array<{ label: string }>;
    relabeled[0]!.label = 'Chorus';
    const retyped = JSON.parse(record().songGroups as string) as Array<{ type: string }>;
    retyped[0]!.type = 'chorus';
    // All three, not a sample.
    expect([
      hymnTextFingerprint(record({ songGroups: JSON.stringify(relabeled) })),
      hymnTextFingerprint(record({ songGroups: JSON.stringify(retyped) })),
      hymnTextFingerprint(record({ title: 'Amazing Grace (My Chains Are Gone)' })),
    ]).not.toContain(base);
  });

  it('ignores styling and whitespace-only differences in bodies', () => {
    const styled = JSON.parse(record().songGroups as string) as Array<{
      slides: Array<{ body: string; textStyle?: unknown }>;
    }>;
    styled[0]!.slides[0]!.textStyle = { bold: true };
    styled[0]!.slides[0]!.body = `  ${styled[0]!.slides[0]!.body}  `;
    expect(hymnTextFingerprint(record({ songGroups: JSON.stringify(styled) }))).toBe(
      hymnTextFingerprint(record())
    );
  });

  it('is an 8-character lowercase hex string', () => {
    expect(hymnTextFingerprint(record())).toMatch(/^[0-9a-f]{8}$/);
  });
});
