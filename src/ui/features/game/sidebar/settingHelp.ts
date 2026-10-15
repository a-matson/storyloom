import type { AdventureSettings, ModelSettings } from '@core/model';

type Image = AdventureSettings['image'];
type Help<S> = { help: string; warn?: (v: number | undefined, s: S) => string | undefined };

export type ImageNumberKey =
  | 'width'
  | 'height'
  | 'steps'
  | 'cfgScale'
  | 'portraitSize'
  | 'portraitSteps'
  | 'clipSkip'
  | 'hiresScale'
  | 'hiresDenoise'
  | 'hiresSteps';
export type ModelNumberKey = { [K in keyof ModelSettings]-?: ModelSettings[K] extends number | undefined ? K : never }[keyof ModelSettings];

const over = (limit: number, text: string) => (v: number | undefined) => (v !== undefined && v > limit ? text : undefined);

// Warning thresholds are [provisional] unless tagged otherwise; 1536² is well above SDXL's native 1024².
const TOO_BIG = 1536 * 1536;

export const IMAGE_HELP: Record<ImageNumberKey, Help<Image>> = {
  width: { help: 'Image width in pixels. Default 512. Use the checkpoint’s native size: 512 for SD 1.5, 1024 for SDXL.' },
  height: {
    help: 'Image height in pixels. Default 512. Width × height near the native area (512² for SD 1.5, 1024² for SDXL) gives the cleanest result.',
    warn: (v, s) => ((v ?? 0) * s.width > TOO_BIG ? 'Far above any checkpoint’s native size: doubled limbs and long waits.' : undefined),
  },
  steps: {
    help: 'Denoising steps. Default 24. More is slower; most checkpoints settle by 30.',
    warn: over(60, 'Slower with little gain; most checkpoints settle by 30.'),
  },
  cfgScale: {
    help: 'How strictly the image follows the prompt. Default 5; follow the checkpoint’s page, usually 4–7.',
    warn: over(12, 'Burnt, oversaturated images on most checkpoints.'),
  },
  clipSkip: {
    help: 'Skips the text encoder’s last layers. Blank (default) uses the checkpoint’s own; anime and SDXL checkpoints often ask for 2.',
    // [measured: 2026-10-15, KoboldCpp, indigoVoidFurryFusedXL_noobaiV24] 1 gave a blank white PNG; the architecture is unknown here, so always warn.
    warn: (v) => (v === 1 ? 'Blank white images on SDXL / NoobAI / Pony checkpoints. Leave blank or use 2.' : undefined),
  },
  hiresScale: { help: 'How much the hires pass upscales before redrawing. 1.5 is common; 2 takes about twice as long.' },
  hiresDenoise: {
    help: 'How much the hires pass redraws. 0.3–0.6 adds detail and keeps the picture.',
    warn: over(0.7, 'Redraws the composition, not just the detail.'),
  },
  hiresSteps: { help: 'Steps for the hires redraw. Blank uses the same as Steps.' },
  portraitSize: { help: 'Portraits are square at this size. Default 384; the checkpoint’s native size (512 or 1024) looks best but is slower.' },
  portraitSteps: { help: 'Denoising steps for portraits. Default 14, so drawing between turns stays quick.' },
};

export const MODEL_HELP: Record<ModelNumberKey, Help<ModelSettings>> = {
  responseLength: {
    help: 'Most tokens one turn may write. Default 200 (about a paragraph); longer turns cost prompt room.',
    warn: (v, s) => (v !== undefined && v > s.contextLength / 4 ? 'Leaves little room for the story in the prompt.' : undefined),
  },
  contextLength: { help: 'Tokens the prompt may fill. Default 8k. Keep it at or below the server’s -c (context size), or the server cuts the prompt.' },
  temperature: { help: 'Randomness. Default 1.0; lower is safer and more repetitive.' },
  topK: { help: 'Picks only from the K likeliest tokens. Default 250; 0 turns it off.' },
  topP: { help: 'Picks from the likeliest tokens up to this share of probability. Default 0.95; 1 turns it off.' },
  minP: { help: 'Drops tokens less likely than this share of the top one. Blank is off; 0.05 is common.' },
  presencePenalty: { help: 'Pushes away from any token used in the repeat window. Default 0.25; 0 is off.' },
  frequencyPenalty: { help: 'Pushes away from tokens by how often the repeat window used them. Default 0 (off).' },
  repetitionPenalty: {
    help: 'Penalises recently used tokens. Blank or 1 is off; 1.05–1.15 is typical.',
    warn: over(1.3, 'Models start avoiding common words and names.'),
  },
  repeatLastN: { help: 'How far back the penalties look. Default 64; long windows starve common words into word salad.' },
  dryMultiplier: { help: 'DRY penalises repeating whole phrases. Default 0.8; 0 is off.' },
  seed: { help: 'Blank picks a new seed each turn. A fixed seed repeats the same output for the same prompt.' },
};
