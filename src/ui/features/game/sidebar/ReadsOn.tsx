import type { AppSettings } from '@core/model';
import { Select } from '@ui/components/ui/field';
import { Section, Setting } from './Section';

type Mode = AppSettings['readsOn'];

/** Shown only with a utility model configured: which helper reads run on it. */
export function ReadsOn({ value, onChange }: { value: Mode; onChange: (v: Mode) => void }) {
  return (
    <Section title="Utility model">
      <Setting
        label="Reads on"
        htmlFor="reads-on"
        title="Per bench: each read on the model that scored best for it; story and utility send every read to one model"
      >
        <Select
          id="reads-on"
          className="h-8 w-35"
          value={value}
          onChange={(e) => onChange(e.target.value === 'story' || e.target.value === 'utility' ? e.target.value : 'bench')}
        >
          <option value="story">Story model</option>
          <option value="utility">Utility model</option>
          <option value="bench">Per bench</option>
        </Select>
      </Setting>
    </Section>
  );
}
