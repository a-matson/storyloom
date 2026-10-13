import type { Action, Adventure, Entity, Speaker } from '../model/types';
import { actionText, newId } from '../model/types';
import { guessSpeakers } from '../text/speakers';
import { matchEntity, norm, words } from './names';

export { knownAs, matchEntity } from './names';

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
 * Fold one sighting into an entity (or create it): aliases union, `lastSeen` moves, and an empty
 * description of a non-canon entity is set once. Readers take who it is from its identity
 * assertion; the field stays for `knownAs` until the entity facts go (M13-2c). What the sighting
 * says is `mergeAssertions`' job.
 */
export function mergeEntity(existing: Entity | undefined, incoming: Omit<Sighting, 'facts' | 'state'>, atAction: number): Entity {
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

const rel = (r: { to: string; label: string }) => `${norm(r.to)}|${norm(r.label)}`;

/**
 * Fold the stored entity `from` into `into` (the player's Merge): aliases and relations union in;
 * `into` keeps its id, name, kind, description and portrait. Assertions move with `mergeOwn`.
 */
export function mergeEntities(into: Entity, from: Entity): Entity {
  return {
    ...into,
    aliases: [...into.aliases, ...unseen([into.name, ...into.aliases].map(norm), [from.name, ...from.aliases], norm)],
    description: into.description || from.description,
    relations: [...into.relations, ...unseen(into.relations.map(rel), from.relations, rel)],
    firstSeen: Math.min(into.firstSeen, from.firstSeen),
    lastSeen: Math.max(into.lastSeen, from.lastSeen),
  };
}
