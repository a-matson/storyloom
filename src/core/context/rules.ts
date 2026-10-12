import { heldBy, itemsAt, YOU } from '../memory/items';
import { currentStates } from '../memory/looks';
import type { Entity, Rule, Scene } from '../model/types';

/** What is in play this turn: entity ids the scene has present (its place too) and the recent text names. */
export interface RuleContext {
  entities: readonly Entity[];
  scene: Scene | undefined;
  present: ReadonlySet<string>;
  mentioned: ReadonlySet<string>;
}

// ponytail: plural by a trailing "s" ("Kobolds" ~ "kobold"); "Elves" ~ "elf" misses, alias the faction.
const one = (s: string) => s.trim().toLowerCase().replace(/s$/, '');

/**
 * Confirmed rules to send: ungated ones, and those with a gate in play — present or named, an item
 * you hold, held by someone present or lying at the place, a faction a present character belongs to
 * (a relation to it, or a `species` look naming it) — or governing an active effect on someone present.
 * Ungated first, then oldest first, so the block reads the same turn to turn.
 */
export function relevantRules(rules: readonly Rule[], ctx: RuleContext): Rule[] {
  const { entities, scene, present, mentioned } = ctx;
  const here = entities.filter((e) => present.has(e.id));
  const items = [...heldBy(entities, YOU), ...here.flatMap((e) => heldBy(entities, e.name)), ...(scene?.location ? itemsAt(entities, scene.location) : [])];
  const live = new Set([...present, ...mentioned, ...items.map((e) => e.id)]);
  const member = (f: Entity) => here.some((e) => e.relations.some((r) => r.to === f.id) || one(currentStates(e)['species'] ?? '') === one(f.name));
  const kinds = new Set(entities.filter((f) => f.kind === 'faction' && member(f)).map((f) => f.id));
  const governed = new Set(
    here.flatMap((e) => e.facts.flatMap((f) => (f.kind === 'effect' && f.until === undefined && f.cause?.kind === 'rule' && f.cause.id ? [f.cause.id] : []))),
  );
  return rules
    .filter((r) => r.status === 'confirmed' && (r.gates.length === 0 || r.gates.some((g) => live.has(g) || kinds.has(g)) || governed.has(r.id)))
    .toSorted((a, b) => Number(a.gates.length > 0) - Number(b.gates.length > 0) || a.createdAt - b.createdAt);
}

/** `[Rules: …]` content: each rule as one clause. */
export const renderRules = (rules: readonly Rule[]): string => rules.map((r) => r.text.trim().replace(/[.;]+$/, '')).join('; ');
