import { entityEdits } from '@app/session/entities';
import { matchEntity } from '@core/memory';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';

type Proposal = NonNullable<Adventure['scriptState']['__aliasProposals']>[number];

/**
 * Yes on a same-kind card merges it into `of`; else Yes makes the name an alias, so its held reply folds onto the entity.
 * No forgets the name and its reply. A pair of cards still apart stays listed at `at` -1, so the fold does not ask again.
 */
function answer(api: GameApi, p: Proposal, of: Entity, card: Entity | undefined, yes: boolean) {
  const merge = yes && card?.kind === of.kind;
  api.mutate((_, adv) => {
    const { __aliasProposals: asks = [], __pending: held = [], ...rest } = adv.scriptState;
    adv.scriptState = {
      ...rest,
      __aliasProposals: [...asks.filter((q) => q.name !== p.name), ...(card && !merge ? [{ ...p, at: -1 }] : [])],
      __pending: yes ? held : held.filter((h) => h.entity.name !== p.name),
    };
    if (yes && !merge) adv.entities = adv.entities.map((e) => (e.id === p.of ? { ...e, aliases: [...e.aliases, p.name] } : e));
  });
  if (merge) void entityEdits(api).merge(p.of, card.id);
}

/** The open alias proposals for one sidebar tab: a card of another kind naming a character shows in the World tab. */
export function AliasProposals({ adventure, api, shown, world }: { adventure: Adventure; api: GameApi; shown: readonly Entity[]; world: boolean }) {
  return (adventure.scriptState.__aliasProposals ?? []).flatMap((p) => {
    const of = adventure.entities.find((e) => e.id === p.of);
    const card = matchEntity(
      adventure.entities.filter((e) => e.id !== p.of),
      p.name,
    );
    const cross = card !== undefined && card.kind !== of?.kind;
    if (!of || p.at < 0 || (cross ? !world : !shown.includes(of))) return [];
    const ask = cross ? `${p.name} names ${of.name}?` : card ? `${p.name} = ${of.name}? Merge` : `${p.name} = ${of.name}?`;
    return [
      <div key={p.name} className="flex items-center gap-1.5 text-caption">
        <span className="grow">{ask}</span>
        <Button variant="ghost" onClick={() => answer(api, p, of, card, true)}>
          Yes
        </Button>
        <Button variant="ghost" onClick={() => answer(api, p, of, card, false)}>
          No
        </Button>
      </div>,
    ];
  });
}
