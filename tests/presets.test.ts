import { describe, expect, it } from 'vitest';
import { createAdventureFromScenario, DEFAULT_ADVENTURE_SETTINGS, MEMORY_PRESETS, newScenario, presetOf, withPreset } from '@core/model';
import { exportScenarioJson, importScenarioJson } from '@adapters/transfer/scenario';

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

  it("a scenario's preset sets the new adventure's memory; none keeps the defaults", () => {
    const s = newScenario('T', 'Start.');
    expect(createAdventureFromScenario({ ...s, memoryPreset: 'sliceOfLife' }, {}).settings.memory).toEqual(withPreset(base, 'sliceOfLife'));
    expect(createAdventureFromScenario(s, {}).settings.memory).toEqual(base);
  });

  it('the preset survives export and import', () => {
    const s = { ...newScenario('T', 'Start.'), memoryPreset: 'adventure' as const };
    expect(importScenarioJson(exportScenarioJson(s)).memoryPreset).toBe('adventure');
  });
});
