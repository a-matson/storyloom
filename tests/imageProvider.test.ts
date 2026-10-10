import { describe, expect, it, vi } from 'vitest';
import { A1111Provider, type Upscale } from '@adapters/providers/a1111';
import { ProviderError } from '@adapters/providers/http';
import type { ImageRequest } from '@core/ports';

// 1x1 transparent PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const req: ImageRequest = { prompt: 'a harbour', width: 512, height: 512, steps: 20, cfgScale: 5 };

/** Records the request and replies with `body`. */
function stub(body: unknown, init: ResponseInit = {}): { fetch: typeof fetch; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const f: typeof fetch = async (input, i) => {
    const r = new Request(input, i);
    calls.push({ url: r.url, body: i?.body === undefined ? undefined : JSON.parse(await r.text()) });
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });
  };
  return { fetch: f, calls };
}

describe('A1111 image provider', () => {
  it('lists checkpoints, preferring the title', async () => {
    const { fetch: f, calls } = stub([{ title: 'sdxl.safetensors [abc]', model_name: 'sdxl' }, { model_name: 'sd15' }, {}]);
    const p = new A1111Provider('img', 'http://localhost:7860/', f);
    expect(await p.models()).toEqual(['sdxl.safetensors [abc]', 'sd15']);
    expect(calls[0]?.url).toBe('http://localhost:7860/sdapi/v1/sd-models');
  });

  it('returns the first image as a non-empty Blob', async () => {
    const p = new A1111Provider('img', 'http://x', stub({ images: [PNG] }).fetch);
    const blob = await p.txt2img(req);
    expect(blob.size).toBeGreaterThan(0);
    expect(await blob.slice(1, 4).text()).toBe('PNG');
  });

  it('sends override_settings only when a model is set', async () => {
    const plain = stub({ images: [PNG] });
    await new A1111Provider('img', 'http://x', plain.fetch).txt2img(req);
    expect(plain.calls[0]?.body).toMatchObject({ prompt: 'a harbour', cfg_scale: 5, negative_prompt: '' });
    expect(plain.calls[0]?.body).not.toHaveProperty('override_settings');

    const withModel = stub({ images: [PNG] });
    await new A1111Provider('img', 'http://x', withModel.fetch).txt2img({ ...req, model: 'sdxl' });
    expect(withModel.calls[0]?.body).toMatchObject({ override_settings: { sd_model_checkpoint: 'sdxl' } });
  });

  it('sends sampler_name and clip_skip only when set', async () => {
    const plain = stub({ images: [PNG] });
    await new A1111Provider('img', 'http://x', plain.fetch).txt2img(req);
    expect(plain.calls[0]?.body).not.toHaveProperty('sampler_name');
    expect(plain.calls[0]?.body).not.toHaveProperty('clip_skip');

    const card = stub({ images: [PNG] });
    await new A1111Provider('img', 'http://x', card.fetch).txt2img({ ...req, sampler: 'DPM++ 2M Karras', clipSkip: 2 });
    expect(card.calls[0]?.body).toMatchObject({ sampler_name: 'DPM++ 2M Karras', clip_skip: 2 });
  });

  it('lists sampler names', async () => {
    const { fetch: f, calls } = stub([{ name: 'Euler a', aliases: [] }, { name: 'DPM++ 2M Karras' }]);
    expect(await new A1111Provider('img', 'http://x', f).samplers()).toEqual(['Euler a', 'DPM++ 2M Karras']);
    expect(calls[0]?.url).toBe('http://x/sdapi/v1/samplers');
  });

  it('img2img sends the init image and the denoise', async () => {
    const { fetch: f, calls } = stub({ images: [PNG] });
    const init = await (await fetch(`data:image/png;base64,${PNG}`)).blob();
    await new A1111Provider('img', 'http://x', f).img2img({ ...req, init, denoise: 0.55 });
    expect(calls[0]?.url).toBe('http://x/sdapi/v1/img2img');
    expect(calls[0]?.body).toMatchObject({ init_images: [PNG], denoising_strength: 0.55 });
  });

  it('reads progress steps, falls back to the fraction, and is undefined when idle', async () => {
    // The idle body probed on KoboldCpp 2026-10-10, trimmed.
    const idle = { progress: 0.0, eta_relative: 0.0, state: { job_count: 0, job_no: 0, sampling_step: 0, sampling_steps: 0 }, current_image: null };
    expect(await new A1111Provider('img', 'http://x', stub(idle).fetch).progress()).toBeUndefined();
    const busy = { progress: 0.25, state: { sampling_step: 10, sampling_steps: 40 } };
    expect(await new A1111Provider('img', 'http://x', stub(busy).fetch).progress()).toEqual({ step: 10, steps: 40 });
    expect(await new A1111Provider('img', 'http://x', stub({ progress: 0.42 }).fetch).progress()).toEqual({ step: 42, steps: 100 });
  });

  it('progress names the hires pass while one runs', async () => {
    const passes: unknown[] = [];
    const p = new A1111Provider('img', 'http://x', stub({ images: [PNG], progress: 0.5 }).fetch, async (b) => {
      passes.push(await p.progress());
      return b;
    });
    await p.txt2img({ ...req, hires: { scale: 1.5, denoise: 0.55 } });
    expect(passes).toEqual([{ step: 50, steps: 100, pass: 1 }]);
    expect(await p.progress()).toEqual({ step: 50, steps: 100 });
  });

  it('a hires request renders, upscales, then redraws at the new size', async () => {
    const { fetch: f, calls } = stub({ images: [PNG] });
    const upscale = vi.fn<Upscale>((b) => Promise.resolve(b));
    await new A1111Provider('img', 'http://x', f, upscale).txt2img({ ...req, sampler: 'DPM++ 2M Karras', hires: { scale: 1.5, denoise: 0.55 } });
    expect(calls.map((c) => c.url)).toEqual(['http://x/sdapi/v1/txt2img', 'http://x/sdapi/v1/img2img']);
    expect(calls[0]?.body).toMatchObject({ width: 512, height: 512 });
    expect(upscale).toHaveBeenCalledWith(expect.any(Blob), 768, 768);
    expect(calls[1]?.body).toMatchObject({ width: 768, height: 768, steps: 20, denoising_strength: 0.55, sampler_name: 'DPM++ 2M Karras' });
  });

  it('throws on a malformed body, an empty image list and a non-200', async () => {
    const bad = new A1111Provider('img', 'http://x', stub({ images: [1] }).fetch);
    await expect(bad.txt2img(req)).rejects.toThrow(ProviderError);
    const empty = new A1111Provider('img', 'http://x', stub({ images: [] }).fetch);
    await expect(empty.txt2img(req)).rejects.toThrow(/no image/);
    // A real KoboldCpp failure: 200, and an empty string where the base64 PNG should be.
    const blank = new A1111Provider('img', 'http://x', stub({ images: [''] }).fetch);
    await expect(blank.txt2img(req)).rejects.toThrow(/no image/);
    const down = new A1111Provider('img', 'http://x', stub({}, { status: 500, statusText: 'Boom' }).fetch);
    await expect(down.models()).rejects.toThrow(ProviderError);
    expect(await down.health()).toBe(false);
  });
});
