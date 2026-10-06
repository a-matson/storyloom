/** Images are re-encoded before they are stored: a 12 MP phone photo is not persisted whole, and a portrait is kept at the size it is shown. */

/** Box `w`x`h` into `max` on its long side, never upscaling. Integers, at least 1 px. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** WebP, quality 0.85 [provisional]: smaller than JPEG at the same quality and universal in current browsers. */
export async function downscale(file: Blob, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image file.'))), 'image/webp', 0.85);
  });
}
