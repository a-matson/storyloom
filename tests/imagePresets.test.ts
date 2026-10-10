import { describe, expect, it } from 'vitest';
import { applyImagePreset, IMAGE_PRESETS, presetFrom, savePreset } from '@core/imagePresets';
import { DEFAULT_ADVENTURE_SETTINGS } from '@core/model';
import { AppSettings } from '@core/schema';

const mine = { ...DEFAULT_ADVENTURE_SETTINGS.image, width: 768, height: 640, portraits: false, portraitStyle: 'ink', hiresScale: 2, hiresSteps: 9 };

describe('image presets', () => {
  it.each(IMAGE_PRESETS)('$name applies all its fields and keeps size, portraits and style', (p) => {
    const out = applyImagePreset(mine, p);
    expect(out).toMatchObject(p.settings);
    expect(out).toMatchObject({ width: 768, height: 640, portraits: false, portraitStyle: 'ink' });
    // A hires preset is the whole recipe; a plain one leaves the dormant hires scale alone.
    expect(out.hiresScale).toBe(p.settings.hires ? 1.5 : 2);
  });

  it('a saved preset round-trips the model-card fields, and a blank sampler clears the old one', () => {
    const tuned = { ...mine, sampler: undefined, clipSkip: 2, steps: 30, cfgScale: 4.5, hires: true, hiresDenoise: 0.4 };
    const saved = presetFrom(tuned, 'Mine');
    const applied = applyImagePreset({ ...DEFAULT_ADVENTURE_SETTINGS.image, sampler: 'Euler a' }, saved);
    expect(applied).toMatchObject({ clipSkip: 2, steps: 30, cfgScale: 4.5, hires: true, hiresScale: 2, hiresDenoise: 0.4, hiresSteps: 9 });
    expect(applied.sampler).toBeUndefined();
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
