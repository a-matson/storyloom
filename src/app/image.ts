/** Images are re-encoded before they are stored: a 12 MP phone photo is not persisted whole, and a portrait is kept at the size it is shown. */

/** Box `w`x`h` into `max` on its long side, never upscaling. Integers, at least 1 px. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

type Size = { w: number; h: number; /** A source rectangle: crop to it before scaling. */ src?: [x: number, y: number, w: number, h: number] };

async function redraw(image: Blob, size: (w: number, h: number) => Size, type: string, failure: string, quality?: number): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const { w, h, src } = size(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (src) ctx?.drawImage(bitmap, ...src, 0, 0, w, h);
  else ctx?.drawImage(bitmap, 0, 0, w, h);
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

/** The centre square at `px` a side, for a portrait: no face detection, the player picks an image with the face central. */
export const cropSquare = (file: Blob, px: number): Promise<Blob> =>
  redraw(
    file,
    (w, h) => {
      const s = Math.min(w, h);
      return { w: px, h: px, src: [(w - s) / 2, (h - s) / 2, s, s] };
    },
    'image/webp',
    'Could not read that image file.',
    0.85,
  );
