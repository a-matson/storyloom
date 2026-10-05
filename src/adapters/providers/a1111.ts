import { fetchJson, ProviderError } from './http';
import { A1111Models, A1111Txt2Img } from './schemas';
import type { ImageProvider, ImageRequest } from '@core/ports';

/**
 * AUTOMATIC1111-compatible image server (Forge, SD.Next, A1111 with `--api`,
 * KoboldCpp with `--sdmodel`).
 *
 *   GET  /sdapi/v1/sd-models → [{ title, model_name }]
 *   POST /sdapi/v1/txt2img   → { images: [base64 PNG] }
 *
 * The checkpoint rides along as `override_settings`, so no stateful `/options` call.
 */
export class A1111Provider implements ImageProvider {
  readonly id: string;
  readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(id: string, baseUrl: string, fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
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

  async txt2img(req: ImageRequest, signal?: AbortSignal): Promise<Blob> {
    const body = {
      prompt: req.prompt,
      negative_prompt: req.negativePrompt ?? '',
      width: req.width,
      height: req.height,
      steps: req.steps,
      cfg_scale: req.cfgScale,
      ...(req.model ? { override_settings: { sd_model_checkpoint: req.model }, override_settings_restore_afterwards: true } : {}),
    };
    const res = await fetchJson(
      this.fetchFn,
      this.url('/sdapi/v1/txt2img'),
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
