import { newId, type AdventureSettings, type ImagePreset } from '../model/types';

type ImageSettings = AdventureSettings['image'];

/**
 * Its own module, not part of `core/image`: that index is on the start-up path, these are sidebar-only.
 * What checkpoint model pages typically ask for. Checkpoint, portraits and style are the adventure's
 * own and stay as they are. All [provisional]: model-page values, not measured here.
 */
export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: 'noobai',
    name: 'NoobAI / Illustrious (SDXL)',
    settings: {
      promptPrefix: 'masterpiece, best quality, newest, absurdres',
      negativePrompt: 'worst quality, low quality, lowres, bad anatomy, bad hands, watermark, signature, text',
      width: 1024,
      height: 1024,
      sampler: 'Euler a',
      steps: 28,
      cfgScale: 5,
      hires: false,
    },
  },
  {
    id: 'pony',
    name: 'Pony (SDXL)',
    settings: {
      promptPrefix: 'score_9, score_8_up, score_7_up',
      negativePrompt: 'score_4, score_5, score_6, watermark, text',
      width: 1024,
      height: 1024,
      sampler: 'Euler a',
      steps: 25,
      cfgScale: 7,
      clipSkip: 2,
      hires: false,
    },
  },
  { id: 'sd15', name: 'SD 1.5', settings: { width: 512, height: 512, sampler: 'Euler a', steps: 24, cfgScale: 5, hires: false } },
  {
    id: 'realistic',
    name: 'Realistic',
    settings: { sampler: 'DPM++ 2M Karras', steps: 28, cfgScale: 6, clipSkip: 2, hires: true, hiresScale: 1.5, hiresDenoise: 0.55 },
  },
  { id: 'fast', name: 'Fast', settings: { sampler: 'DPM++ 2M Karras', steps: 14, cfgScale: 5, clipSkip: 2, hires: false } },
];

/**
 * A preset is the whole model-card recipe: a field it leaves out (a saved "server default" sampler, no
 * prefix) is cleared, so the result never depends on what was applied before. Size is the exception:
 * a preset without one keeps the adventure's.
 */
export function applyImagePreset(s: ImageSettings, p: ImagePreset): ImageSettings {
  const { hiresScale, hiresDenoise, width, height, ...rest } = p.settings;
  return {
    ...s,
    sampler: undefined,
    clipSkip: undefined,
    hiresSteps: undefined,
    promptPrefix: undefined,
    promptSuffix: undefined,
    negativePrompt: undefined,
    ...rest,
    width: width ?? s.width,
    height: height ?? s.height,
    hiresScale: hiresScale ?? s.hiresScale,
    hiresDenoise: hiresDenoise ?? s.hiresDenoise,
  };
}

/** The current recipe under a name the player chose. */
export const presetFrom = (s: ImageSettings, name: string): ImagePreset => ({
  id: newId('ipr_'),
  name,
  settings: {
    sampler: s.sampler,
    clipSkip: s.clipSkip,
    steps: s.steps,
    cfgScale: s.cfgScale,
    hires: s.hires,
    hiresScale: s.hiresScale,
    hiresDenoise: s.hiresDenoise,
    hiresSteps: s.hiresSteps,
    promptPrefix: s.promptPrefix,
    promptSuffix: s.promptSuffix,
    negativePrompt: s.negativePrompt,
    width: s.width,
    height: s.height,
  },
});

/** Saving under a name that exists replaces that preset, so "update my preset" is just Save again. */
export function savePreset(saved: ImagePreset[], preset: ImagePreset): ImagePreset[] {
  const same = (p: ImagePreset) => p.name.trim().toLowerCase() === preset.name.trim().toLowerCase();
  const old = saved.find(same);
  return old ? saved.map((p) => (p === old ? { ...preset, id: old.id } : p)) : [...saved, preset];
}
