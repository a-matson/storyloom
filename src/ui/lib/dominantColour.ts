/** The accent colour of a cover image, as HSL in degrees and percent. */
export interface Accent {
  h: number;
  s: number;
  l: number;
}

// Saturation and lightness the accent is pushed into, so a washed-out or pitch-black
// cover still gives a colour that reads on the dark background. [provisional]
const S = { min: 45, max: 85 };
const L = { min: 55, max: 68 };
const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.round(Math.min(max, Math.max(min, v)));

/**
 * Average the RGBA pixels and push the result into the readable band.
 * ponytail: a flat average, not k-means; swap in a histogram if a cover reads muddy.
 */
export function accentFrom(pixels: Uint8ClampedArray): Accent {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    r += pixels[i] ?? 0;
    g += pixels[i + 1] ?? 0;
    b += pixels[i + 2] ?? 0;
  }
  const n = Math.max(1, pixels.length / 4) * 255;
  return toHsl(r / n, g / n, b / n);
}

function toHsl(r: number, g: number, b: number): Accent {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const h = d === 0 ? 0 : max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h * 60), s: clamp(s * 100, S), l: clamp(l * 100, L) };
}

/** Draws the cover into a 16x16 canvas and reads its accent. Rejects if the image cannot be decoded. */
export async function coverAccent(url: string): Promise<Accent> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');
  ctx.drawImage(bitmap, 0, 0, 16, 16);
  bitmap.close();
  return accentFrom(ctx.getImageData(0, 0, 16, 16).data);
}
