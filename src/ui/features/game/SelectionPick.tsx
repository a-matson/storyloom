import type { Entity } from '@core/model';
import { Select } from '@ui/components/ui/field';

/** A one-shot character menu in the selection bar: picking one runs `onPick` with its id. */
export function SelectionPick({
  label,
  prompt,
  characters,
  onPick,
}: {
  label: string;
  prompt: string;
  characters: readonly Entity[];
  onPick: (id: string) => void;
}) {
  return (
    <Select aria-label={label} className="h-8 w-auto" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{prompt}</option>
      {characters.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </Select>
  );
}
