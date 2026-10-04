import { describe, expect, it } from 'vitest';
import { fitWithin } from '../src/ui/lib/image';

describe('fitWithin', () => {
  it('keeps the aspect ratio when it shrinks', () => {
    expect(fitWithin(4000, 3000, 768)).toEqual({ w: 768, h: 576 });
    expect(fitWithin(3000, 4000, 768)).toEqual({ w: 576, h: 768 });
  });

  it('never upscales', () => {
    expect(fitWithin(200, 100, 768)).toEqual({ w: 200, h: 100 });
  });

  it('returns whole pixels, at least one', () => {
    const { w, h } = fitWithin(4001, 777, 768);
    expect(Number.isInteger(w) && Number.isInteger(h)).toBe(true);
    expect(fitWithin(5000, 1, 768).h).toBe(1);
  });
});
