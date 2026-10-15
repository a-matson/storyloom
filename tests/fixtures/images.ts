import type { ImageProvider } from '@core/ports';

export const fakeImages = (txt2img: ImageProvider['txt2img']): ImageProvider => ({
  id: 'img',
  baseUrl: 'http://img.invalid',
  health: () => Promise.resolve(true),
  models: () => Promise.resolve([]),
  samplers: () => Promise.resolve([]),
  txt2img,
  // The hires pass lives inside the adapter's txt2img; the session never calls img2img itself.
  img2img: () => Promise.reject(new Error('not called by the session')),
});
