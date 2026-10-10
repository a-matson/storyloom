/**
 * Image generation is a *second* local server (Forge/SD.Next on :7860, or KoboldCpp
 * with --sdmodel), not a `Provider`: no streaming, no tokens, no shared samplers. So
 * it gets its own narrow port instead of widening `ProviderCapabilities`.
 */

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string | undefined;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** Fixed for a stable picture from the same prompt; unset = random. */
  seed?: number | undefined;
  /** Checkpoint to switch to for this request only. */
  model?: string | undefined;
  /** A1111 sampler name, as a model card gives it; unset = server default. */
  sampler?: string | undefined;
  clipSkip?: number | undefined;
  /** A model page's "denoise": render, upscale by `scale`, then img2img at `denoise`. Two server calls. */
  hires?: { scale: number; denoise: number; steps?: number | undefined } | undefined;
}

/** Where the running render is. `pass` is set only while a hires request runs its two passes. */
export interface ImageProgress {
  step: number;
  steps: number;
  pass?: 1 | 2 | undefined;
}

export interface ImageProvider {
  readonly id: string;
  readonly baseUrl: string;
  health(signal?: AbortSignal): Promise<boolean>;
  models(signal?: AbortSignal): Promise<string[]>;
  samplers(signal?: AbortSignal): Promise<string[]>;
  txt2img(req: ImageRequest, signal?: AbortSignal): Promise<Blob>;
  img2img(req: ImageRequest & { init: Blob; denoise: number }, signal?: AbortSignal): Promise<Blob>;
  /** Optional: a server without the route is still a provider. `undefined` = nothing to show yet. */
  progress?(signal?: AbortSignal): Promise<ImageProgress | undefined>;
}
