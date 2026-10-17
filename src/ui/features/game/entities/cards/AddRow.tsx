import { useState } from 'react';
import type { Entity } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';

const KINDS = ['trait', 'state', 'item', 'effect', 'event', 'goal', 'rule'] as const;
export type AddKind = (typeof KINDS)[number];

const HINT: Record<AddKind, string> = {
  trait: 'Distrusts priests',
  goal: 'Get the ledger back',
  state: 'mood: wary',
  item: 'Brass key',
  effect: 'Poisoned',
  event: 'Pulled you from the river',
  rule: 'Never lies',
};

/** "+ trait / + state / + item / + effect / + event / + goal / + rule about <name>": the player's own lines. */
export function AddRow({ entity: e, onAdd }: { entity: Entity; onAdd: (kind: AddKind, text: string) => void }) {
  const [kind, setKind] = useState<AddKind>('trait');
  const [text, setText] = useState('');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        onAdd(kind, text.trim());
        setText('');
      }}
    >
      <Select aria-label="Add what" className="h-8 w-auto" value={kind} onChange={(ev) => setKind(KINDS.find((k) => k === ev.target.value) ?? 'trait')}>
        <option value="trait">+ trait</option>
        <option value="state">+ state</option>
        {e.kind !== 'item' && <option value="item">+ item</option>}
        <option value="effect">+ effect</option>
        <option value="event">+ event</option>
        {e.kind === 'character' && <option value="goal">+ goal</option>}
        <option value="rule">+ rule about {e.name}</option>
      </Select>
      <Input className="h-8 min-w-0" aria-label="New line" placeholder={HINT[kind]} value={text} onChange={(ev) => setText(ev.target.value)} />
      <Button type="submit" variant="primary" className="h-8 shrink-0" disabled={text.trim() === ''}>
        Add
      </Button>
    </form>
  );
}
