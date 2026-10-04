import { describe, expect, it } from 'vitest';
import { accentFrom } from '../src/ui/lib/dominantColour';

const flat = (r: number, g: number, b: number) => new Uint8ClampedArray(Array.from({ length: 4 * 16 }, (_, i) => [r, g, b, 255][i % 4] ?? 0));

const inBand = (a: { s: number; l: number }) => a.s >= 45 && a.s <= 85 && a.l >= 55 && a.l <= 68;

describe('accentFrom', () => {
  it('pushes black, white and grey into the readable band', () => {
    for (const grey of [0, 128, 255]) expect(inBand(accentFrom(flat(grey, grey, grey)))).toBe(true);
  });

  it('keeps the hue of a saturated cover', () => {
    expect(accentFrom(flat(220, 40, 40)).h).toBe(0);
    expect(accentFrom(flat(40, 220, 40)).h).toBe(120);
    expect(accentFrom(flat(40, 40, 220)).h).toBe(240);
  });

  it('averages a two-colour cover', () => {
    const half = new Uint8ClampedArray([...flat(255, 0, 0).slice(0, 32), ...flat(255, 255, 0).slice(0, 32)]);
    expect(accentFrom(half).h).toBe(30);
  });

  it('clamps a washed-out cover up to a visible saturation', () => {
    expect(accentFrom(flat(200, 195, 190)).s).toBe(45);
  });
});
