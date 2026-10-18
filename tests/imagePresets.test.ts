import { describe, expect, it } from 'vitest';
import { applyImagePreset, IMAGE_PRESETS, presetFrom, savePreset } from '@core/imagePresets';
import { DEFAULT_ADVENTURE_SETTINGS } from '@core/model';
import { AppSettings } from '@core/schema';

const mine = { ...DEFAULT_ADVENTURE_SETTINGS.image, width: 768, height: 640, portraits: false, portraitStyle: 'ink', hiresScale: 2, hiresSteps: 9 };

describe('image presets', () => {
  it.each(IMAGE_PRESETS)('$name applies all its fields and keeps portraits, style and an unset size', (p) => {
    const out = applyImagePreset(mine, p);
    expect(out).toMatchObject(p.settings);
    expect(out).toMatchObject({ width: p.settings.width ?? 768, height: p.settings.height ?? 640, portraits: false, portraitStyle: 'ink' });
    // A hires preset is the whole recipe; a plain one leaves the dormant hires scale alone.
    expect(out.hiresScale).toBe(p.settings.hires ? 1.5 : 2);
  });

  // Clip skip 1 blanks every image on an SDXL checkpoint [measured: 2026-10-15].
  it('SD 1.5 default sets no clip skip, and applying it clears a stored one', () => {
    const sd15 = IMAGE_PRESETS.filter((p) => p.id === 'sd15');
    expect(sd15).toHaveLength(1);
    expect(sd15.map((p) => [p.settings.clipSkip, applyImagePreset({ ...mine, clipSkip: 1 }, p).clipSkip])).toEqual([[undefined, undefined]]);
  });

  it('a saved preset round-trips the model-card fields, and a blank sampler clears the old one', () => {
    const tuned = { ...mine, sampler: undefined, clipSkip: 2, steps: 30, cfgScale: 4.5, hires: true, hiresDenoise: 0.4 };
    const saved = presetFrom(tuned, 'Mine');
    const applied = applyImagePreset({ ...DEFAULT_ADVENTURE_SETTINGS.image, sampler: 'Euler a' }, saved);
    expect(applied).toMatchObject({ clipSkip: 2, steps: 30, cfgScale: 4.5, hires: true, hiresScale: 2, hiresDenoise: 0.4, hiresSteps: 9 });
    expect(applied.sampler).toBeUndefined();
  });

  it('built-in ids stay, so a saved reference stays valid', () => {
    expect(IMAGE_PRESETS.map((p) => p.id)).toEqual(['noobai', 'pony', 'sd15', 'realistic', 'fast']);
  });

  it('applies prefix, suffix, negative and size from a recipe', () => {
    const noob = IMAGE_PRESETS.find((p) => p.id === 'noobai');
    const out = noob && applyImagePreset({ ...mine, promptSuffix: 'nsfw' }, noob);
    expect(out).toMatchObject({ promptPrefix: 'masterpiece, best quality, newest, absurdres', width: 1024, height: 1024 });
    expect(out?.negativePrompt).toContain('bad hands');
    expect(out?.promptSuffix).toBeUndefined();
  });

  it('a recipe without a prefix clears it, and keeps the size', () => {
    const fast = IMAGE_PRESETS.find((p) => p.id === 'fast');
    const out = fast && applyImagePreset({ ...mine, promptPrefix: 'score_9', negativePrompt: 'text' }, fast);
    expect(out).toMatchObject({ width: 768, height: 640 });
    expect([out?.promptPrefix, out?.negativePrompt]).toEqual([undefined, undefined]);
  });

  it('presetFrom copies the recipe fields', () => {
    const recipe = { promptPrefix: 'score_9', promptSuffix: 'nsfw', negativePrompt: 'text', width: 768, height: 640 };
    expect(applyImagePreset(DEFAULT_ADVENTURE_SETTINGS.image, presetFrom({ ...mine, ...recipe }, 'Mine'))).toMatchObject(recipe);
  });

  it('saving under an existing name replaces that preset and keeps its id', () => {
    const a = presetFrom(mine, 'Mine');
    const b = presetFrom({ ...mine, steps: 40 }, ' mine ');
    const list = savePreset(savePreset([], a), b);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.id, settings: { steps: 40 } });
    expect(savePreset(list, presetFrom(mine, 'Other'))).toHaveLength(2);
  });

  it('saved presets survive the settings schema, and old records get none', () => {
    const preset = presetFrom(mine, 'Mine');
    const parsed = AppSettings.parse(JSON.parse(JSON.stringify({ providers: [], defaultProviderId: 'local', imagePresets: [preset] })));
    expect(parsed.imagePresets[0]).toMatchObject({ name: 'Mine', settings: { steps: 24, hiresScale: 2 } });
    expect(AppSettings.parse({ providers: [], defaultProviderId: 'local' }).imagePresets).toEqual([]);
  });
});
