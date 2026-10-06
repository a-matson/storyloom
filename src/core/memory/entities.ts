import type { Entity, EntityFact, ExtractedEntity } from '../model/types';
import { newId } from '../model/types';

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
 * Fold one sighting into an entity (or create it). Model output only adds: facts append (deduped),
 * aliases union, a changed `state` value keeps the old one as a fact. Existing facts — the
 * player's and pinned ones included — and a non-empty description are never replaced.
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
  const addFact = (text: string): void => {
    const key = norm(text);
    if (!key || known.has(key)) return;
    known.add(key);
    facts.push({ id: newId('fact_'), text: text.trim(), fromAction: atAction, source: 'memory' } satisfies EntityFact);
  };

  const state = { ...base.state };
  for (const [key, value] of Object.entries(incoming.state ?? {})) {
    const old = state[key];
    if (old !== undefined && norm(old) !== norm(value)) addFact(`${key} was ${old} until action ${atAction}`);
    state[key] = value;
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
    description: base.description || (incoming.description ?? '').trim(),
    facts,
    state,
    relations,
    lastSeen: Math.max(base.lastSeen, atAction),
  };
}
