import { MEMORY_PRESETS, presetOf, withPreset, type AdventureSettings, type MemoryPresetId } from '@core/model';
import { Select } from '@ui/components/ui/field';
import { Setting } from './Section';

type Memory = AdventureSettings['memory'];
const PRESET_IDS: MemoryPresetId[] = ['sliceOfLife', 'adventure'];

export function MemoryPreset({ value, onChange }: { value: Memory; onChange: (m: Memory) => void }) {
  return (
    <Setting label="Memory preset" htmlFor="memory-preset" help="Sets bank size and the reads for a kind of story; editing one shows Custom">
      <Select
        id="memory-preset"
        className="h-8 w-35"
        value={presetOf(value) ?? ''}
        onChange={(e) => {
          const id = PRESET_IDS.find((x) => x === e.target.value);
          if (id) onChange(withPreset(value, id));
        }}
      >
        <option value="" disabled>
          Custom
        </option>
        {PRESET_IDS.map((id) => (
          <option key={id} value={id}>
            {MEMORY_PRESETS[id].name}
          </option>
        ))}
      </Select>
    </Setting>
  );
}
