import type { Action, Adventure, Entity, Speaker } from '../model/types';
import { actionText, newId } from '../model/types';
import { guessSpeakers } from '../text/speakers';
import { norm, words } from './names';
import { MAX_ROLES } from './roles';
import { playerName } from './you';

export { entityNamedIn, knownAs, matchEntity } from './names';

const isOutput = (a: Action) => a.type === 'continue' || a.type === 'start';

/**
 * The client guess for AI output nobody has labelled yet, so the gutter fills before the helper
 * reads the turn. Every guessed action gets a label list (`[]` when nobody matched) so it is read
 * once; a retry or version switch clears it. Nothing before the first character exists.
 */
export function guessUnlabelled(adventure: Pick<Adventure, 'actions' | 'entities' | 'plot'>): Map<string, Speaker[]> {
  const cast = adventure.entities.filter((e) => e.kind === 'character');
  const out = new Map<string, Speaker[]>();
  if (!cast.length) return out;
  const you = playerName(adventure);
  for (const a of adventure.actions) if (a.speakers === undefined && isOutput(a)) out.set(a.id, guessSpeakers(actionText(a), cast, {}, you));
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
  return midSentence(passage, n).length > 0;
}

/** What precedes each place `passage` holds `n` as whole words not at the start of a sentence. */
export function midSentence(passage: string, n: string): string[] {
  return wholeAt(passage, n).flatMap((i) => {
    const before = passage.slice(0, i).trimEnd();
    const prev = before.at(-1);
    return prev !== undefined && (!OPENS_SENTENCE.test(prev) || before.at(-2) === ',') ? [before] : [];
  });
}

/** Where `passage` holds `n` as whole words. */
function wholeAt(passage: string, n: string): number[] {
  const out: number[] = [];
  for (let i = n ? passage.indexOf(n) : -1; i >= 0; i = passage.indexOf(n, i + 1))
    if (!WORD.test(passage[i - 1] ?? '') && !WORD.test(passage[i + n.length] ?? '')) out.push(i);
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
 * Fold one sighting into an entity (or create it): aliases union, `lastSeen` moves. What the
 * sighting says, its description included, is `mergeAssertions`' job.
 */
export function mergeEntity(existing: Entity | undefined, incoming: Omit<Sighting, 'facts' | 'state'>, atAction: number): Entity {
  const base: Entity = existing ?? {
    id: newId('ent_'),
    kind: incoming.kind,
    name: incoming.name.trim(),
    aliases: [],
    description: '',
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

  return { ...base, aliases, lastSeen: Math.max(base.lastSeen, atAction) };
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
 * `into` keeps its id, name, kind, card text and portrait. Assertions move with `mergeOwn`.
 */
export function mergeEntities(into: Entity, from: Entity): Entity {
  return {
    ...into,
    aliases: [...into.aliases, ...unseen([into.name, ...into.aliases].map(norm), [from.name, ...from.aliases], norm)],
    relations: [...into.relations, ...unseen(into.relations.map(rel), from.relations, rel)],
    ...((into.roles ?? from.roles) && { roles: [...new Set([...(from.roles ?? []), ...(into.roles ?? [])])].slice(-MAX_ROLES) }),
    firstSeen: Math.min(into.firstSeen, from.firstSeen),
    lastSeen: Math.max(into.lastSeen, from.lastSeen),
  };
}
