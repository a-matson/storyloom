import type { ReactNode } from 'react';
import type { entityEdits } from '@app/session/entities';
import { eventsOf, isSpeciesClash, isValue, matchEntity, standing, textOf, YOU, type AssertionOf } from '@core/memory';
import type { Adventure, Assertion, Entity } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Pill } from '@ui/components/ui/pill';
import { Line } from './FactRows';

/** What every card line needs to edit its entity. */
export interface Card {
  entity: Entity;
  /** The entity's assertions. */
  own: readonly Assertion[];
  adventure: Adventure;
  edits: ReturnType<typeof entityEdits>;
  onShow: (index: number) => void;
  onOpen: (id: string) => void;
}

/** An edit of "key: value" keeps the key out of the value. */
const valueOf = (key: string, t: string) => (t.startsWith(`${key}:`) ? t.slice(key.length + 1).trim() : t);
const keyOf = (a: Assertion) =>
  a.kind === 'look' || a.kind === 'state' ? a.key : a.kind === 'relationship' ? a.to : a.kind === 'voice' ? 'speaks' : a.kind === 'goal' ? 'wants' : '';

export function FactLine({ card: c, fact: f, text, children }: { card: Card; fact: Assertion; text: string; children?: ReactNode }) {
  const key = keyOf(f);
  return (
    <Line
      text={text}
      fact={f}
      adventure={c.adventure}
      onShow={c.onShow}
      onEdit={(t) => c.edits.editLine(f.id, key ? valueOf(key, t) : t)}
      onDelete={() => c.edits.deleteLine(f.id)}
      onPin={() => c.edits.pinLine(f.id)}
    >
      {children}
    </Line>
  );
}

const norm = (s: string) => s.trim().toLowerCase();
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** A stance, with the trust and fear the events since moved it by; the title is the event that swapped its word. */
export function RelationLine({ card: c, fact: f }: { card: Card; fact: AssertionOf<'relationship'> }) {
  const from = norm(f.to) === YOU ? YOU : matchEntity(c.adventure.entities, f.to)?.id;
  const events = eventsOf(c.adventure.assertions, f.subject);
  const s = from === undefined ? undefined : standing(f, events, from);
  const crossed = events.find((a) => a.at === s?.crossedAt && a.who[0] === from);
  return (
    <FactLine card={c} fact={f} text={`${f.to}: ${f.stance}`}>
      {s && (s.trust !== 0 || s.fear !== 0) && (
        <span className="text-caption text-muted-foreground" title={crossed?.text}>
          trust {signed(s.trust)} · fear {signed(s.fear)}
        </span>
      )}
    </FactLine>
  );
}

/** A key's current value; an edit is the player's value for the key. */
export function StateLine({ card: c, k, v }: { card: Card; k: string; v: string }) {
  const e = c.entity;
  const line = c.own.findLast((a) => isValue(a) && a.until === undefined && a.key === k);
  const locked = e.canonKeys?.includes(k) ?? false;
  return (
    <Line
      text={`${k}: ${v}`}
      fact={line}
      adventure={c.adventure}
      onShow={c.onShow}
      onEdit={(t) => c.edits.setValue(e.id, k, valueOf(k, t))}
      onDelete={() => {
        if (line) c.edits.deleteLine(line.id);
        if (locked) c.edits.unlock(e.id, k);
      }}
      // The player's own value already wins over the story's; only the story's is pinned.
      onPin={line && line.basis !== 'player' ? () => c.edits.pinLine(line.id) : undefined}
    >
      <Button
        variant="ghost"
        className="h-7 shrink-0"
        aria-pressed={locked}
        aria-label={`Lock ${k} as canon`}
        onClick={() => (locked ? c.edits.unlock(e.id, k) : c.edits.lock(e.id, k, v))}
      >
        {locked ? 'Canon' : 'Lock'}
      </Button>
    </Line>
  );
}

/** A conflict on a closed key, or a proposal on a free-text one: the player is the author and takes a side. */
export function ClaimLine({ card: c, fact: f }: { card: Card; fact: Assertion }) {
  const proposal = f.kind !== 'conflict';
  // Both sides are the story's here, so the buttons name them.
  const species = isSpeciesClash(f);
  const text =
    f.kind === 'look' || f.kind === 'state'
      ? `the story says ${f.key} is ${f.value}`
      : species
        ? `the identity says ${f.claimed}; the looks say ${f.canon}`
        : textOf(f);
  return (
    <Line text={text} fact={f} adventure={c.adventure} onShow={c.onShow} onDelete={() => c.edits.deleteLine(f.id)}>
      <Pill tone="see">{proposal ? 'proposal' : 'conflict'}</Pill>
      <Button className="h-7" onClick={() => c.edits.keepCanon(f.id)}>
        {species ? 'Keep the looks' : 'Keep canon'}
      </Button>
      <Button className="h-7" onClick={() => c.edits.accept(f.id)}>
        {species ? 'Keep the identity' : 'Accept the story'}
      </Button>
    </Line>
  );
}

/** `wants: goal`; the batch read's is a proposal the cast does not send until confirmed. */
export function GoalLine({ card: c, fact: f }: { card: Card; fact: AssertionOf<'goal'> }) {
  return (
    <FactLine card={c} fact={f} text={`wants: ${f.text}`}>
      {f.seen === false && (
        <>
          <Pill tone="see">proposal</Pill>
          <Button className="h-7" onClick={() => c.edits.confirm(f.id)}>
            Confirm
          </Button>
        </>
      )}
    </FactLine>
  );
}

/** `meanwhile: …`, what a returning character did while away: a proposal until confirmed; ✕ ends it and keeps it as history. */
export function MeanwhileLine({ card: c, fact: f }: { card: Card; fact: AssertionOf<'state'> }) {
  return (
    <FactLine card={c} fact={f} text={`meanwhile: ${f.value}`}>
      {f.seen === false && (
        <>
          <Pill tone="see">proposal</Pill>
          <Button className="h-7" onClick={() => c.edits.confirm(f.id)}>
            Confirm
          </Button>
        </>
      )}
      <Button variant="ghost" className="h-7 shrink-0" aria-label="End: meanwhile" onClick={() => c.edits.endLine(f.id)}>
        ✕
      </Button>
    </FactLine>
  );
}

/** `condition — cause`; a cause with a card opens it, ✕ ends the effect. */
export function EffectLine({ card: c, fact: f }: { card: Card; fact: AssertionOf<'effect'> }) {
  const cause = f.cause;
  return (
    <FactLine card={c} fact={f} text={f.condition}>
      {cause?.id !== undefined && cause.kind !== 'rule' ? (
        <Button variant="ghost" className="h-7 shrink-0" onClick={() => c.onOpen(cause.id ?? '')}>
          {cause.text}
        </Button>
      ) : (
        cause && <span className="text-muted-foreground">— {cause.text}</span>
      )}
      <Button variant="ghost" className="h-7 shrink-0" aria-label={`End: ${f.condition}`} onClick={() => c.edits.endLine(f.id)}>
        ✕
      </Button>
    </FactLine>
  );
}
