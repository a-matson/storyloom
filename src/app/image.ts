/** Images are re-encoded before they are stored: a 12 MP phone photo is not persisted whole, and a portrait is kept at the size it is shown. */

/** Box `w`x`h` into `max` on its long side, never upscaling. Integers, at least 1 px. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function redraw(image: Blob, size: (w: number, h: number) => { w: number; h: number }, type: string, failure: string, quality?: number): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const { w, h } = size(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(failure))), type, quality);
  });
}

/** WebP, quality 0.85 [provisional]: smaller than JPEG at the same quality and universal in current browsers. */
export const downscale = (file: Blob, max: number): Promise<Blob> =>
  redraw(file, (w, h) => fitWithin(w, h, max), 'image/webp', 'Could not read that image file.', 0.85);

/** The hires pass's init image: the browser's own resampling, then img2img redraws the detail. PNG, since it is sent, not stored. */
export const upscale = (image: Blob, w: number, h: number): Promise<Blob> =>
  redraw(image, () => ({ w, h }), 'image/png', 'Could not upscale the image for the hires pass.');
