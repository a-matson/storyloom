import type { AdventureSettings } from '@core/model';
import { Select } from '@ui/components/ui/field';
import { Setting } from './Section';

type Mode = AdventureSettings['memory']['stateRead'];

export function StateRead({ value, onChange }: { value: Mode; onChange: (v: Mode) => void }) {
  return (
    <Setting label="State read" htmlFor="state-read" title="One helper call after the turn read for what changed for whoever is there">
      <Select
        id="state-read"
        className="h-8 w-35"
        value={value}
        onChange={(e) => onChange(e.target.value === 'idle' || e.target.value === 'off' ? e.target.value : 'every')}
      >
        <option value="every">Every turn</option>
        <option value="idle">Idle only</option>
        <option value="off">Off</option>
      </Select>
    </Setting>
  );
}
