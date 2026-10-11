import type { Action, Adventure, Entity, EntityFact, Speaker } from '../model/types';
import { actionText, newId } from '../model/types';
import { guessSpeakers } from '../text/speakers';
import type { Source } from './invalidate';
import { currentStates, isCurrentState } from './looks';

const isOutput = (a: Action) => a.type === 'continue' || a.type === 'start';

/**
 * The client guess for AI output nobody has labelled yet, so the gutter fills before the helper
 * reads the turn. Every guessed action gets a label list (`[]` when nobody matched) so it is read
 * once; a retry or version switch clears it. Nothing before the first character exists.
 */
export function guessUnlabelled({ actions, entities }: Pick<Adventure, 'actions' | 'entities'>): Map<string, Speaker[]> {
  const cast = entities.filter((e) => e.kind === 'character');
  const out = new Map<string, Speaker[]>();
  if (!cast.length) return out;
  for (const a of actions) if (a.speakers === undefined && isOutput(a)) out.set(a.id, guessSpeakers(actionText(a), cast));
  return out;
}

const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');

/** The entity called `name`, by name or alias, ignoring case and spacing. */
export function matchEntity(entities: readonly Entity[], name: string): Entity | undefined {
  const n = norm(name);
  return entities.find((e) => norm(e.name) === n || e.aliases.some((a) => norm(a) === n));
}

// What may precede a sentence's first word: its end, a quote, a colon or dash, the `]` of an action's `[n] `.
const OPENS_SENTENCE = /[.!?"“”‘’'…:—\]]/u;
const WORD = /[\p{L}\p{N}]/u;

/**
 * Whether `passage` writes `name` as a name: exactly, as whole words, at least once where a common
 * noun would not be capitalised (not at the start of a sentence). Rejects the grammar's forced
 * capitals ("Cobblestones"), sentence-initial vagueness ("Something") and names the model copied
 * from the prompt's example. `"Run," Tamsin said` counts: a quote after a comma closes no sentence.
 * A name the passage also writes lower-case ("the kobold") is a species or a thing, not a name.
 */
export function namedInPassage(name: string, passage: string): boolean {
  const n = name.trim();
  if (n.toLowerCase() !== n && wholeAt(passage, n.toLowerCase()).length) return false;
  return wholeAt(passage, n).some((i) => {
    const before = passage.slice(0, i).trimEnd();
    const prev = before.at(-1);
    return prev !== undefined && (!OPENS_SENTENCE.test(prev) || before.at(-2) === ',');
  });
}

/** Where `passage` holds `n` as whole words. */
function wholeAt(passage: string, n: string): number[] {
  const out: number[] = [];
  for (let i = n ? passage.indexOf(n) : -1; i >= 0; i = passage.indexOf(n, i + 1))
    if (!WORD.test(passage[i - 1] ?? '') && !WORD.test(passage[i + n.length] ?? '')) out.push(i);
  return out;
}

const words = (s: string): string =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/** The words of a name without a leading "the", so "Ashen Order" is "The Ashen Order". */
const bare = (name: string) => words(name).replace(/^ the /, ' ');
const one = (hits: Entity[]) => (hits.length === 1 ? hits[0] : undefined);

/**
 * The entity a name means: `matchEntity`, else the one entity whose name or alias holds it as
 * whole words ("Brannoch", "Ashen Order"), else the one whose name holds all but a leading title
 * its description opens with ("Captain Marr" for "Captain Ysolde Marr commands…", not for Aldric,
 * "…is Captain Ysolde Marr's brother"). Two candidates: none.
 */
export function knownAs(entities: readonly Entity[], name: string): Entity | undefined {
  const exact = matchEntity(entities, name);
  if (exact) return exact;
  const n = bare(name);
  const holds = (e: Entity, part: string) => part.trim() !== '' && [e.name, ...e.aliases].some((k) => bare(k).includes(part));
  const [title = '', ...rest] = n.trim().split(' ');
  return (
    one(entities.filter((e) => holds(e, n))) ??
    (rest.length ? one(entities.filter((e) => holds(e, ` ${rest.join(' ')} `) && words(e.description).startsWith(` ${title} `))) : undefined)
  );
}

/** The entity whose name or alias `text` contains as whole words; the longest wins, so "Lena Morrow" beats "Lena". */
export function entityNamedIn<E extends Pick<Entity, 'name' | 'aliases'>>(entities: readonly E[], text: string): E | undefined {
  const t = words(text);
  let best: { e: E; len: number } | undefined;
  for (const e of entities)
    for (const n of [e.name, ...e.aliases]) {
      const k = words(n);
      if (k.trim() && t.includes(k) && k.length > (best?.len ?? 0)) best = { e, len: k.length };
    }
  return best?.e;
}

/**
 * The helper's per-action `speakers` as paragraph labels by action id, for AI output only. The text
 * decides first (the client rule over every character); an action whose one resolved speaker the
 * helper names also labels the quoted paragraphs the text names nobody in ("the dragon rumbles").
 * Names no entity resolves are dropped. Scored on the hand labels, letting the helper's lone name
 * override the text lost precision (17/21 against 22/23).
 */
export function attributeSpeakers(
  actions: readonly Action[],
  speakers: readonly { action: number; name: string }[],
  entities: readonly Entity[],
): Map<string, Speaker[]> {
  const cast = entities.filter((e) => e.kind === 'character');
  const out = new Map<string, Speaker[]>();
  for (const i of new Set(speakers.map((s) => s.action))) {
    const a = actions[i];
    if (!a || !isOutput(a)) continue;
    const named = [...new Set(speakers.flatMap((s) => (s.action === i ? (matchEntity(entities, s.name)?.name ?? []) : [])))];
    if (named.length) out.set(a.id, guessSpeakers(actionText(a), cast, named.length === 1 ? named[0] : undefined));
  }
  return out;
}

/** Whether `inner` is `outer` or a run of its whole words. */
export const within = (inner: string, outer: string) => words(outer).includes(words(inner));

/** What one reply says about one entity: trait facts and state values (looks included). */
export interface Sighting {
  name: string;
  kind: Entity['kind'];
  aliases?: string[] | undefined;
  description: string;
  facts: string[];
  state?: Record<string, string> | undefined;
}

/**
 * Fold one sighting into an entity (or create it). Facts append, deduped by text and by
 * containment (a model fact the new one contains is replaced by it); aliases union; a `state`
 * value becomes a state fact that ends (`until`) the key's current one. The player's and pinned
 * facts, the `state` map and a non-empty description are never replaced. Canon: a canon entity's
 * description is never set, and a change to a `canonKeys` value is recorded as a conflict fact
 * instead. `source` stamps new facts with the action they came from.
 */
export function mergeEntity(existing: Entity | undefined, incoming: Sighting, atAction: number, source?: (text: string) => Source | undefined): Entity {
  const base: Entity = existing ?? {
    id: newId('ent_'),
    kind: incoming.kind,
    name: incoming.name.trim(),
    aliases: [],
    description: '',
    facts: [],
    state: {},
    relations: [],
    firstSeen: atAction,
    lastSeen: atAction,
  };
  const facts = [...base.facts];
  const fact = (text: string, from: string, extra?: Partial<EntityFact>): EntityFact => ({
    id: newId('fact_'),
    text: text.trim(),
    fromAction: atAction,
    source: 'memory',
    ...source?.(from),
    ...extra,
  });
  const addFact = (text: string, extra?: Partial<EntityFact>, from = text): void => {
    const key = norm(text);
    if (!key) return;
    const i = facts.findIndex((f) => f.kind !== 'state' && (within(key, f.text) || within(f.text, key)));
    const old = facts[i];
    if (old && within(key, old.text)) return;
    if (old && old.source === 'memory' && !old.pinned && !old.conflict) facts[i] = { ...fact(text, from, extra), id: old.id };
    else facts.push(fact(text, from, extra));
  };

  const current = currentStates(base);
  const locked = new Set(base.canonKeys);
  for (const [key, value] of Object.entries(incoming.state ?? {})) {
    const old = current[key];
    if (!norm(value) || (old !== undefined && norm(old) === norm(value))) continue;
    if (old !== undefined && locked.has(key)) {
      addFact(`the story says ${key} is ${value}, but canon says ${old}`, { conflict: true, claim: { key, value } }, value);
      continue;
    }
    for (const [i, f] of facts.entries()) if (isCurrentState(f) && f.key === key) facts[i] = { ...f, until: atAction };
    facts.push(fact(`${key}: ${value.trim()}`, value, { kind: 'state', key, value: value.trim() }));
    current[key] = value;
  }
  for (const f of incoming.facts) addFact(f);

  const names = new Set([base.name, ...base.aliases].map(norm));
  const aliases = [...base.aliases];
  for (const a of incoming.aliases ?? []) {
    if (!norm(a) || names.has(norm(a))) continue;
    names.add(norm(a));
    aliases.push(a.trim());
  }

  return {
    ...base,
    aliases,
    // Frozen once set: a later one is a fact.
    description: base.canon ? base.description : base.description || incoming.description.trim(),
    facts,
    lastSeen: Math.max(base.lastSeen, atAction),
  };
}

/** Items of `extra` whose key is not in `seen` (nor repeated within `extra`). */
function unseen<T>(seen: Iterable<string>, extra: readonly T[], key: (t: T) => string): T[] {
  const keys = new Set(seen);
  return extra.filter((t) => {
    const k = key(t);
    if (!k || keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

/**
 * Fold the stored entity `from` into `into` (the player's Merge): facts, aliases, relations and
 * missing state values union in; `into` keeps its id, name, kind, description and portrait.
 */
export function mergeEntities(into: Entity, from: Entity): Entity {
  const rel = (r: { to: string; label: string }) => `${norm(r.to)}|${norm(r.label)}`;
  return {
    ...into,
    aliases: [...into.aliases, ...unseen([into.name, ...into.aliases].map(norm), [from.name, ...from.aliases], norm)],
    description: into.description || from.description,
    facts: [
      ...into.facts,
      ...unseen(
        into.facts.map((f) => norm(f.text)),
        from.facts,
        (f) => norm(f.text),
      ),
    ],
    state: { ...from.state, ...into.state },
    relations: [...into.relations, ...unseen(into.relations.map(rel), from.relations, rel)],
    firstSeen: Math.min(into.firstSeen, from.firstSeen),
    lastSeen: Math.max(into.lastSeen, from.lastSeen),
  };
}
