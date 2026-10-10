import { fetchJson, ProviderError } from './http';
import { A1111Models, A1111Samplers, A1111Txt2Img } from './schemas';
import type { ImageProvider, ImageRequest } from '@core/ports';

/** Resizes a PNG to exactly `w`x`h`. Canvas work needs the DOM, so the app passes it in. */
export type Upscale = (image: Blob, w: number, h: number) => Promise<Blob>;

const noUpscale: Upscale = () => Promise.reject(new ProviderError('This image provider cannot run a hires pass'));

// SD latents are 8 px and some servers round to 64 on their own; 64 keeps both passes predictable. [provisional]
const snap = (px: number) => Math.max(64, Math.round(px / 64) * 64);

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  // Chunked: spreading a whole PNG into fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * AUTOMATIC1111-compatible image server (Forge, SD.Next, A1111 with `--api`,
 * KoboldCpp with `--sdmodel`).
 *
 *   GET  /sdapi/v1/sd-models → [{ title, model_name }]
 *   GET  /sdapi/v1/samplers  → [{ name }]
 *   POST /sdapi/v1/txt2img   → { images: [base64 PNG] }
 *   POST /sdapi/v1/img2img   → { images: [base64 PNG] }
 *
 * The checkpoint rides along as `override_settings`, so no stateful `/options` call.
 */
export class A1111Provider implements ImageProvider {
  readonly id: string;
  readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly upscale: Upscale;

  constructor(id: string, baseUrl: string, fetchFn: typeof fetch = (...a) => fetch(...a), upscale: Upscale = noUpscale) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
    this.upscale = upscale;
  }

  private url(path: string): string {
    return this.baseUrl.replace(/\/$/, '') + path;
  }

  async health(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.models(signal);
      return true;
    } catch {
      return false;
    }
  }

  async models(signal?: AbortSignal): Promise<string[]> {
    const rows = await fetchJson(this.fetchFn, this.url('/sdapi/v1/sd-models'), A1111Models, {}, signal);
    return rows.map((m) => m.title ?? m.model_name ?? '').filter((t) => t !== '');
  }

  async samplers(signal?: AbortSignal): Promise<string[]> {
    return (await fetchJson(this.fetchFn, this.url('/sdapi/v1/samplers'), A1111Samplers, {}, signal)).map((s) => s.name);
  }

  /** With `hires`, two server calls behind one method, so the image queue and the trace see one job. */
  async txt2img(req: ImageRequest, signal?: AbortSignal): Promise<Blob> {
    const base = await this.render('/sdapi/v1/txt2img', req, {}, signal);
    if (!req.hires) return base;
    const width = snap(req.width * req.hires.scale);
    const height = snap(req.height * req.hires.scale);
    const init = await this.upscale(base, width, height);
    return this.img2img({ ...req, width, height, steps: req.hires.steps ?? req.steps, init, denoise: req.hires.denoise }, signal);
  }

  async img2img(req: ImageRequest & { init: Blob; denoise: number }, signal?: AbortSignal): Promise<Blob> {
    return this.render('/sdapi/v1/img2img', req, { init_images: [await base64(req.init)], denoising_strength: req.denoise }, signal);
  }

  private async render(path: string, req: ImageRequest, extra: object, signal?: AbortSignal): Promise<Blob> {
    const body = {
      prompt: req.prompt,
      negative_prompt: req.negativePrompt ?? '',
      width: req.width,
      height: req.height,
      steps: req.steps,
      cfg_scale: req.cfgScale,
      ...(req.seed !== undefined && { seed: req.seed }),
      // An unknown sampler name falls back to the server default rather than failing.
      ...(req.sampler !== undefined && { sampler_name: req.sampler }),
      ...(req.clipSkip !== undefined && { clip_skip: req.clipSkip }),
      ...(req.model ? { override_settings: { sd_model_checkpoint: req.model }, override_settings_restore_afterwards: true } : {}),
      ...extra,
    };
    const res = await fetchJson(
      this.fetchFn,
      this.url(path),
      A1111Txt2Img,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      signal,
    );
    const first = res.images[0];
    // KoboldCpp answers a failed render with 200 and `{"images": [""]}`; without this the empty
    // string decodes to a 0-byte blob and renders as a broken picture nothing can explain.
    // [measured: docs/measurements/2026-10-05-live-images.json]
    if (first === undefined || first === '') throw new ProviderError('The image server returned no image');
    // `fetch` on a data: URL is the platform's base64 decoder; no hand-rolled one.
    return await (await fetch(`data:image/png;base64,${first}`)).blob();
  }
}
