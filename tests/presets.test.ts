import { describe, expect, it } from 'vitest';
import { DEFAULT_ADVENTURE_SETTINGS, MEMORY_PRESETS, presetOf, withPreset } from '@core/model';

const base = DEFAULT_ADVENTURE_SETTINGS.memory;

describe('memory presets', () => {
  it('sets the preset fields and leaves the others alone', () => {
    const m = withPreset({ ...base, autoSummary: false, contradictionCheck: true }, 'sliceOfLife');
    expect(m).toMatchObject({ ...MEMORY_PRESETS.sliceOfLife.memory, autoSummary: false, contradictionCheck: true });
  });

  it('round-trips each preset', () => {
    expect(presetOf(withPreset(base, 'sliceOfLife'))).toBe('sliceOfLife');
    expect(presetOf(withPreset(base, 'adventure'))).toBe('adventure');
  });

  it('is Custom after one preset field is edited', () => {
    expect(presetOf({ ...withPreset(base, 'adventure'), bankSize: 300 })).toBeUndefined();
    // A field outside the preset does not make it Custom.
    expect(presetOf({ ...withPreset(base, 'adventure'), autoSummary: false })).toBe('adventure');
  });
});
