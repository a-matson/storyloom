import type { Entity, EntityFact } from '../model/types';

export interface RankedFact {
  entity: Entity;
  fact: EntityFact;
}

/**
 * Facts for the next prompt, best first: pinned facts, then facts of entities present in the scene
 * (what the next sentence needs), then facts of entities the recent text names; newest first in
 * each tier. Other entities' facts are left out. A canon conflict ranks as pinned and is kept as
 * worded, so the model always sees the disagreement. W1-4 replaces the name match with lexical/vector fusion.
 */
export function rankFacts(entities: Entity[], present: ReadonlySet<string>, mentioned: ReadonlySet<string>): RankedFact[] {
  const tier = ({ entity, fact }: RankedFact): number => (fact.pinned || fact.conflict ? 0 : present.has(entity.id) ? 1 : mentioned.has(entity.id) ? 2 : 3);
  return entities
    .flatMap((entity) => entity.facts.map((fact) => ({ entity, fact })))
    .filter((r) => tier(r) < 3)
    .toSorted((a, b) => tier(a) - tier(b) || b.fact.fromAction - a.fact.fromAction);
}
