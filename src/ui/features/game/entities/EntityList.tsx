import { useState, useSyncExternalStore } from 'react';
import { currentStates, identityText, indexAssertions } from '@core/memory';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { progressText, useImageProgress } from '@ui/hooks/useImageProgress';
import { Button } from '@ui/components/ui/button';
import { Pill } from '@ui/components/ui/pill';
import { StatusDot } from '@ui/components/ui/status-dot';
import { CHIP, SECTION, SECTION_HEADER } from '../sidebar/Section';
import { Avatar } from './Avatar';
import { EntityDrawer } from './EntityDrawer';
import { YouCard } from './YouCard';

type Kind = Entity['kind'];
const WORLD: Kind[] = ['place', 'item', 'faction'];

/** A dot while the portrait is queued or drawing, red when it failed; the drawer says why. */
function PortraitDot({ id, api }: { id: string; api: GameApi }) {
  const state = useSyncExternalStore(api.subscribe, () => api.getSnapshot().portraitState[id]);
  const p = useImageProgress('portrait');
  if (!state) return null;
  const failed = state.status === 'failed';
  const drawing = state.status === 'rendering' && p ? `Drawing portrait · ${progressText(p)}` : 'Drawing portrait';
  return (
    <span title={failed ? 'Portrait failed' : drawing} className="inline-flex">
      <StatusDot status={failed ? 'bad' : 'busy'} />
    </span>
  );
}

type Proposal = NonNullable<Adventure['scriptState']['__aliasProposals']>[number];

/** Yes makes the name an alias, so its held reply folds onto the entity; No forgets the name and its reply. */
const answer = (api: GameApi, p: Proposal, yes: boolean) =>
  api.mutate((_, adv) => {
    const { __aliasProposals: asks = [], __pending: held = [], ...rest } = adv.scriptState;
    adv.scriptState = {
      ...rest,
      __aliasProposals: asks.filter((q) => q.name !== p.name),
      __pending: yes ? held : held.filter((h) => h.entity.name !== p.name),
    };
    if (yes) adv.entities = adv.entities.map((e) => (e.id === p.of ? { ...e, aliases: [...e.aliases, p.name] } : e));
  });

/** One sidebar tab: the characters, or the places, items and factions the story has named. Built by the memory cycle. */
export function EntityList({ adventure, api, world }: { adventure: Adventure; api: GameApi; world: boolean }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const kinds: Kind[] = world ? (kind ? [kind] : WORLD) : ['character'];
  const shown = adventure.entities.filter((e) => kinds.includes(e.kind));
  const opened = adventure.entities.find((e) => e.id === open);
  const ix = indexAssertions(adventure.assertions);

  return (
    <>
      {world && (
        <div className="flex gap-1.5">
          {WORLD.map((k) => (
            <button key={k} type="button" className={CHIP} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
              {k}
            </button>
          ))}
        </div>
      )}
      {(adventure.scriptState.__aliasProposals ?? []).flatMap((p) => {
        const of = shown.find((e) => e.id === p.of);
        return of
          ? [
              <div key={p.name} className="flex items-center gap-1.5 text-caption">
                <span className="grow">
                  {p.name} = {of.name}?
                </span>
                <Button variant="ghost" onClick={() => answer(api, p, true)}>
                  Yes
                </Button>
                <Button variant="ghost" onClick={() => answer(api, p, false)}>
                  No
                </Button>
              </div>,
            ]
          : [];
      })}
      {!world && <YouCard adventure={adventure} api={api} />}
      {shown.length === 0 && (
        <p className="text-caption text-muted-foreground">
          Nothing yet. {world ? 'Places, items and factions' : 'Characters'} appear here as the story introduces them.
        </p>
      )}
      {shown.map((e) => (
        <button key={e.id} type="button" className={`${SECTION} p-0 text-left`} aria-label={`Open ${e.name}`} onClick={() => setOpen(e.id)}>
          <div className={`${SECTION_HEADER} cursor-pointer`}>
            <Avatar name={e.name} adventureId={adventure.id} portraitId={e.portraitId} />
            <span className="flex min-w-0 grow flex-col">
              <span className="flex items-center gap-1.5">
                <span className="truncate">{e.name}</span>
                {e.canon && <Pill>canon</Pill>}
                <PortraitDot id={e.id} api={api} />
              </span>
              <span className="truncate text-caption font-normal text-muted-foreground">
                {Object.entries(currentStates(ix.of(e.id)))
                  .map(([k, v]) => (k === 'holder' ? `held by ${v}` : `${k}: ${v}`))
                  .join(' · ') || identityText(e, ix.of(e.id))}
              </span>
            </span>
          </div>
        </button>
      ))}
      {opened && <EntityDrawer key={opened.id} entity={opened} adventure={adventure} api={api} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  );
}
