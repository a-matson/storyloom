import type { Action, Assertion, Entity, ExtractedEntity } from '../model/types';
import { FACT_CHARS, INTRODUCED_CHARS, LOOK_CHARS } from '../schema/extraction';
import { textOf } from './assertionIndex';
import { within, type Sighting } from './entities';
import type { Source } from './invalidate';
import type { MemoryRange } from './memoryBank';
import { supportNaming, supportOf } from './support';

// The guards on what one reply entity says; `fold.ts` decides which entity it is.

/** A value that says there is none: the 12B fills the field anyway ("Not described in the passage", "None specified"). [measured: 2026-10-09-live-play-m11-2.json] */
export const EMPTY_VALUE = /\bnot (?:described|mentioned|stated|shown|given|specified)\b|^(?:unknown|nobody|no one|none(?: specified| given)?|n\/a)\.?$/i;

/** The shortest sentence cap: a value this long with no closing punctuation was cut by it. */
const CUT_AT = Math.min(FACT_CHARS, INTRODUCED_CHARS);

/** A value the grammar's cap (`at`) cut, back to its last sentence end, else its last comma; `''` when nothing whole is left. */
export function uncut(text: string, at = CUT_AT): string {
  const t = text.trim();
  // `text`, not `t`: a cut that ended on a space is still at the cap.
  if (text.length < at || /[.!?]["”’)]?$/u.test(t)) return t;
  const end = Math.max(...['. ', '! ', '? '].map((p) => t.lastIndexOf(p)));
  if (end > 0) return t.slice(0, end + 1);
  const comma = t.lastIndexOf(',');
  return comma > 0 ? t.slice(0, comma) : '';
}

/** A value of a reply a guard dropped, so every run shows what the guards cost. `entity-dropped`: a fact of an entity the name rules dropped. */
export interface Rejected {
  entity: string;
  value: string;
  reason: 'state-text' | 'no-shared-word' | 'wrong-subject' | 'entity-dropped' | 'look-inferred' | 'identity-unnamed' | 'unknown-to' | 'role-rejected';
  passageRange: MemoryRange;
}

/** One reply entity; the introduction call's carry no facts or relationships. */
export type Incoming = Omit<ExtractedEntity, 'facts'> & { facts?: string[] | undefined };

export interface Guard {
  actions: readonly Action[];
  who: { name: string; aliases: string[] };
  kind: Entity['kind'];
  /** The entity's assertions so far, and its identity (`''`: none yet). */
  own: readonly Assertion[];
  identity: string;
  /** The name a relationship's `to` means, `you` for the player. */
  toward: (to: string) => string | undefined;
  /** Each kept value's source, filled here. */
  backed: Map<string, Source>;
  reject: (value: string, reason: Rejected['reason']) => void;
}

/** What one reply entity says that the range backs: facts, stated looks, stances, and an identity only from a sentence naming it (read D). */
export function sightingOf(item: Incoming & { facts: string[]; aliases: string[] }, g: Guard): Sighting & { relationships: { to: string; stance: string }[] } {
  const { looks, relationships = [], facts, ...e } = item;
  const keep = (value: string, o: { cap?: number; about?: string; look?: boolean } = {}): string[] => {
    const v = uncut(value, o.cap);
    if (!v || EMPTY_VALUE.test(v)) return [];
    const s = supportOf(g.actions, g.who, `${o.about ?? ''} ${v}`);
    if (typeof s === 'string' || (o.look && s.basis !== 'stated')) {
      g.reject(v, typeof s === 'string' ? s : 'look-inferred');
      return [];
    }
    g.backed.set(v, s);
    return [v];
  };
  const kept = Object.fromEntries(
    Object.entries(g.kind === 'character' ? (looks ?? {}) : {}).flatMap(([k, v = '']) => keep(v, { cap: LOOK_CHARS, look: true }).map((t) => [k, t])),
  );
  const states = [...g.own.flatMap((a) => (a.kind === 'state' || a.kind === 'look' ? [textOf(a)] : [])), ...Object.entries(kept).map(([k, v]) => `${k}: ${v}`)];
  const raw = uncut(e.description);
  const source = g.identity || !raw ? undefined : supportNaming(g.actions, g.who, raw);
  if (typeof source === 'string') g.reject(raw, 'identity-unnamed');
  else if (source) g.backed.set(raw, source);
  const description = typeof source === 'object' ? raw : '';
  const card = g.identity || description;
  return {
    ...e,
    description,
    relationships: relationships.flatMap(({ to, stance }) => {
      const name = g.toward(to);
      if (!name) g.reject(`${to}: ${stance}`, 'unknown-to');
      // "You" has no content word: the sentence naming both backs the stance.
      return name ? keep(stance, { cap: LOOK_CHARS, about: name }).map((t) => ({ to: name, stance: t })) : [];
    }),
    facts: facts.flatMap((f) => {
      // The 12B restates a new card's description as its first fact (a duplicate, not a loss: not logged), and writes a state ("location: the marsh") as a fact too.
      if (within(f, card)) return [];
      if (states.some((s) => within(f, s))) g.reject(f, 'state-text');
      else return keep(f);
      return [];
    }),
    state: kept,
  };
}
