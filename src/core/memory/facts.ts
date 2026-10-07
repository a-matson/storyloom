import type { Entity, EntityFact } from '../model/types';

export interface RankedFact {
  entity: Entity;
  fact: EntityFact;
}

/**
 * Whether the prompt may use the entity: canon, carded, touched by the player (a player or pinned
 * fact), or seen in two extracted ranges (each range stamps its last action, so `lastSeen` moves).
 * One sighting is too often a misread for the structured cap.
 */
export const isConfirmed = (e: Entity): boolean =>
  !!e.canon || !!e.cardId || e.lastSeen > e.firstSeen || e.facts.some((f) => f.source !== 'memory' || f.pinned);

/**
 * Facts for the next prompt, best first: pinned facts, then facts of entities present in the scene
 * (what the next sentence needs), then facts of entities the recent text names. Within a tier, facts
 * the query matches lexically (`lexical`, BM25 ids best first) lead, then newest first. Other
 * entities' facts are left out: a lexical hit on "the" must not spend the structured cap. A canon
 * conflict ranks as pinned and is kept as worded, so the model always sees the disagreement.
 */
export function rankFacts(entities: Entity[], present: ReadonlySet<string>, mentioned: ReadonlySet<string>, lexical: readonly string[] = []): RankedFact[] {
  const tier = ({ entity, fact }: RankedFact): number => (fact.pinned || fact.conflict ? 0 : present.has(entity.id) ? 1 : mentioned.has(entity.id) ? 2 : 3);
  const hits = new Map(lexical.map((id, i) => [id, i]));
  const hit = (r: RankedFact) => hits.get(r.fact.id) ?? Infinity;
  return entities
    .flatMap((entity) => entity.facts.map((fact) => ({ entity, fact })))
    .filter((r) => tier(r) < 3)
    .toSorted((a, b) => tier(a) - tier(b) || hit(a) - hit(b) || b.fact.fromAction - a.fact.fromAction);
}
