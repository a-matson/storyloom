import { currentStates, heldBy, setWhere, YOU } from '@core/memory';
import type { Entity } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import type { Update } from './EntityDetails';

/** An item is held by someone or at a place; choosing one clears the other. A value no entry names stays selectable. */
export function ItemRows({ entity: e, entities, update }: { entity: Entity; entities: readonly Entity[]; update: Update }) {
  const now = currentStates(e);
  const names = (kind: Entity['kind']) => entities.filter((x) => x.kind === kind).map((x) => x.name);
  const row = (key: 'holder' | 'location', label: string, options: string[]) => {
    const value = now[key] ?? '';
    return (
      <Select aria-label={label} className="h-8" value={value} onChange={(ev) => update(setWhere(e, key, ev.target.value))}>
        <option value="">{label}: nobody</option>
        {[...new Set([...options, ...(value ? [value] : [])])].map((o) => (
          <option key={o} value={o}>
            {label}: {o}
          </option>
        ))}
      </Select>
    );
  };
  return (
    <>
      <SectionLabel>Where</SectionLabel>
      {row('holder', 'Held by', [YOU, ...names('character')])}
      {row('location', 'At', names('place'))}
    </>
  );
}

/** The items a character holds; a click opens the item's card. */
export function Has({ entity: e, entities, onOpen }: { entity: Entity; entities: readonly Entity[]; onOpen: (id: string) => void }) {
  const items = heldBy(entities, e.name);
  if (items.length === 0) return null;
  return (
    <>
      <SectionLabel>Has</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Button key={i.id} variant="ghost" className="h-7" onClick={() => onOpen(i.id)}>
            {i.name}
          </Button>
        ))}
      </div>
    </>
  );
}
