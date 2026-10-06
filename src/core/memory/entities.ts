import type { Action, Adventure, Entity, EntityFact, ExtractedEntity, Speaker } from '../model/types';
import { actionText, newId } from '../model/types';
import { guessSpeakers } from '../text/speakers';

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

/**
 * Fold one sighting into an entity (or create it). Model output only adds: facts append (deduped),
 * aliases union, a changed `state` value keeps the old one as a fact. Existing facts — the
 * player's and pinned ones included — and a non-empty description are never replaced. Canon:
 * a canon entity's description is never set, and a change to a `canonKeys` value is recorded as
 * a conflict fact instead of applied.
 */
export function mergeEntity(existing: Entity | undefined, incoming: ExtractedEntity, atAction: number): Entity {
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
  const known = new Set(facts.map((f) => norm(f.text)));
  const addFact = (text: string, extra?: Partial<EntityFact>): void => {
    const key = norm(text);
    if (!key || known.has(key)) return;
    known.add(key);
    facts.push({ id: newId('fact_'), text: text.trim(), fromAction: atAction, source: 'memory', ...extra } satisfies EntityFact);
  };

  const state = { ...base.state };
  const locked = new Set(base.canonKeys);
  for (const [key, value] of Object.entries(incoming.state ?? {})) {
    const old = state[key];
    if (old === undefined || norm(old) === norm(value)) state[key] = value;
    else if (locked.has(key)) addFact(`the story says ${key} is ${value}, but canon says ${old}`, { conflict: true, claim: { key, value } });
    else {
      addFact(`${key} was ${old} until action ${atAction}`);
      state[key] = value;
    }
  }
  for (const f of incoming.facts) addFact(f);

  const names = new Set([base.name, ...base.aliases].map(norm));
  const aliases = [...base.aliases];
  for (const a of incoming.aliases ?? []) {
    if (!norm(a) || names.has(norm(a))) continue;
    names.add(norm(a));
    aliases.push(a.trim());
  }

  const relKey = (r: { to: string; label: string }) => `${norm(r.to)}|${norm(r.label)}`;
  const rels = new Set(base.relations.map(relKey));
  const relations = [...base.relations];
  for (const r of incoming.relations ?? []) {
    if (rels.has(relKey(r))) continue;
    rels.add(relKey(r));
    relations.push(r);
  }

  return {
    ...base,
    aliases,
    description: base.canon ? base.description : base.description || (incoming.description ?? '').trim(),
    facts,
    state,
    relations,
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
