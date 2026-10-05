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
  /** Checkpoint to switch to for this request only. */
  model?: string | undefined;
}

export interface ImageProvider {
  readonly id: string;
  readonly baseUrl: string;
  health(signal?: AbortSignal): Promise<boolean>;
  models(signal?: AbortSignal): Promise<string[]>;
  txt2img(req: ImageRequest, signal?: AbortSignal): Promise<Blob>;
}
