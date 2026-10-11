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

const KIND_ORDER = ['state', 'effect', 'relationship', 'trait'];
const kindRank = (f: EntityFact) => KIND_ORDER.indexOf(f.kind ?? 'trait');

/**
 * Facts for the next prompt, best first: pinned facts, then facts of entities present in the scene
 * (what the next sentence needs), then facts of entities the recent text names. Within a tier: by
 * entity name, then kind (state, effect, relationship, trait), then newest first, so the block
 * reads the same turn to turn and the prompt cache holds. Other entities' facts, ended states and
 * the old `looked:` history are left out. A canon conflict ranks as pinned and is kept as worded,
 * so the model always sees the disagreement.
 */
export function rankFacts(entities: Entity[], present: ReadonlySet<string>, mentioned: ReadonlySet<string>): RankedFact[] {
  const tier = ({ entity, fact }: RankedFact): number => (fact.pinned || fact.conflict ? 0 : present.has(entity.id) ? 1 : mentioned.has(entity.id) ? 2 : 3);
  return entities
    .flatMap((entity) => entity.facts.map((fact) => ({ entity, fact })))
    .filter((r) => tier(r) < 3 && r.fact.until === undefined && !r.fact.text.startsWith('looked: '))
    .toSorted(
      (a, b) => tier(a) - tier(b) || a.entity.name.localeCompare(b.entity.name) || kindRank(a.fact) - kindRank(b.fact) || b.fact.fromAction - a.fact.fromAction,
    );
}
