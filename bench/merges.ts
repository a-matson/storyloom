import { matchEntity, mergeEntities } from '@core/memory/entities';
import type { Adventure, Entity } from '@core/model/types';

type Stored = Pick<Adventure, 'entities' | 'scriptState'>;

/** M23-6: the cards left once the player accepts every same-kind merge proposal, in order. */
const acceptMerges = (adv: Stored): Entity[] =>
  (adv.scriptState.__aliasProposals ?? []).reduce((es, p) => {
    const into = es.find((e) => e.id === p.of);
    const from = matchEntity(
      es.filter((e) => e !== into),
      p.name,
    );
    return into && from?.kind === into.kind ? es.flatMap((e) => (e === from ? [] : e === into ? [mergeEntities(into, from)] : [e])) : es;
  }, adv.entities);

/** The alias proposals by name, and the card names after accepting the merges. */
export const mergeScore = (adv: Stored) => ({
  proposals: (adv.scriptState.__aliasProposals ?? []).map((p) => ({ name: p.name, of: adv.entities.find((e) => e.id === p.of)?.name, at: p.at })),
  merged: acceptMerges(adv).map((e) => e.name),
});
