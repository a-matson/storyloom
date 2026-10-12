import type { ReactNode } from 'react';
import type { entityEdits } from '@app/session/entities';
import { isCurrentState, setState } from '@core/memory';
import type { Adventure, Entity, EntityFact } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Pill } from '@ui/components/ui/pill';
import { Line } from './FactRows';

/** What every card line needs to edit its entity. */
export interface Card {
  entity: Entity;
  adventure: Adventure;
  edits: ReturnType<typeof entityEdits>;
  onShow: (index: number) => void;
  onOpen: (id: string) => void;
}

/** An edit of "key: value" keeps the key out of the value. */
const valueOf = (key: string, t: string) => (t.startsWith(`${key}:`) ? t.slice(key.length + 1).trim() : t);
const update = (c: Card, p: Partial<Entity>) => c.edits.update(c.entity.id, p);
const pin = (c: Card, id: string) => update(c, { facts: c.entity.facts.map((f) => (f.id === id ? { ...f, pinned: !f.pinned } : f)) });
const without = (c: Card, id: string | undefined) => c.entity.facts.filter((f) => f.id !== id);
const unlocked = (c: Card, key: string) => (c.entity.canonKeys ?? []).filter((x) => x !== key);

export function FactLine({ card: c, fact: f, text, children }: { card: Card; fact: EntityFact; text: string; children?: ReactNode }) {
  const key = f.kind === 'state' || f.kind === 'relationship' ? (f.key ?? '') : '';
  return (
    <Line
      text={text}
      fact={f}
      adventure={c.adventure}
      onShow={c.onShow}
      onEdit={(t) => c.edits.editFact(c.entity.id, f.id, key ? valueOf(key, t) : t)}
      onDelete={() => c.edits.deleteFact(c.entity.id, f.id)}
      onPin={() => pin(c, f.id)}
    >
      {children}
    </Line>
  );
}

/** A state is the map value or a current fact; edits go through `setState` so the two never disagree. */
export function StateLine({ card: c, k, v }: { card: Card; k: string; v: string }) {
  const e = c.entity;
  const fact = e.facts.find((f) => isCurrentState(f) && f.key === k);
  const locked = e.canonKeys?.includes(k) ?? false;
  return (
    <Line
      text={`${k}: ${v}`}
      fact={fact}
      adventure={c.adventure}
      onShow={c.onShow}
      onEdit={(t) => update(c, setState(e, k, valueOf(k, t)))}
      onDelete={() => update(c, { state: setState(e, k, '').state, facts: without(c, fact?.id), canonKeys: unlocked(c, k) })}
      onPin={() => fact && pin(c, fact.id)}
    >
      {/* Locking moves the value into the map, so the lock and the value live in one place. */}
      <Button
        variant="ghost"
        className="h-7 shrink-0"
        aria-pressed={locked}
        aria-label={`Lock ${k} as canon`}
        onClick={() => update(c, locked ? { canonKeys: unlocked(c, k) } : { ...setState(e, k, v), canonKeys: [...(e.canonKeys ?? []), k] })}
      >
        {locked ? 'Canon' : 'Lock'}
      </Button>
    </Line>
  );
}

/** The player is the author: taking the story's side writes its value and unlocks the key. */
export function ConflictLine({ card: c, fact: f }: { card: Card; fact: EntityFact }) {
  const claim = f.claim;
  return (
    <Line text={f.text} fact={f} adventure={c.adventure} onShow={c.onShow} onDelete={() => c.edits.deleteFact(c.entity.id, f.id)}>
      <Pill tone="see">conflict</Pill>
      <Button className="h-7" onClick={() => update(c, { facts: without(c, f.id) })}>
        Keep canon
      </Button>
      {claim && (
        <Button
          className="h-7"
          onClick={() => update(c, { ...setState({ ...c.entity, facts: without(c, f.id) }, claim.key, claim.value), canonKeys: unlocked(c, claim.key) })}
        >
          Accept the story
        </Button>
      )}
    </Line>
  );
}

/** `condition — cause`; a cause with a card opens it, ✕ ends the effect. */
export function EffectLine({ card: c, fact: f }: { card: Card; fact: EntityFact }) {
  const cause = f.cause;
  const text = f.value ?? f.text;
  return (
    <FactLine card={c} fact={f} text={text}>
      {cause?.id !== undefined && cause.kind !== 'rule' ? (
        <Button variant="ghost" className="h-7 shrink-0" onClick={() => c.onOpen(cause.id ?? '')}>
          {cause.text}
        </Button>
      ) : (
        cause && <span className="text-muted-foreground">— {cause.text}</span>
      )}
      <Button variant="ghost" className="h-7 shrink-0" aria-label={`End: ${text}`} onClick={() => c.edits.endEffect(c.entity.id, f.id)}>
        ✕
      </Button>
    </FactLine>
  );
}
