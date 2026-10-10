import type { AdventureSettings } from '../model/types';
import type { ImageRequest } from '../ports/images';

type ImageSettings = AdventureSettings['image'];

/** A See-sized picture (See mode, covers) from the adventure's image settings; the hires pass only when it is on. */
export const imageRequest = (s: ImageSettings, prompt: string): ImageRequest => ({
  prompt,
  width: s.width,
  height: s.height,
  steps: s.steps,
  cfgScale: s.cfgScale,
  negativePrompt: s.negativePrompt,
  model: s.model,
  sampler: s.sampler,
  clipSkip: s.clipSkip,
  ...(s.hires && { hires: { scale: s.hiresScale, denoise: s.hiresDenoise, steps: s.hiresSteps } }),
});
