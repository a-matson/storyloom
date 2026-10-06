import { useState } from 'react';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Pill } from '@ui/components/ui/pill';
import { CHIP, SECTION, SECTION_HEADER } from '../sidebar/Section';
import { Avatar } from './Avatar';
import { EntityDrawer } from './EntityDrawer';

type Kind = Entity['kind'];
const WORLD: Kind[] = ['place', 'item', 'faction'];

/** One sidebar tab: the characters, or the places, items and factions the story has named. Built by the memory cycle. */
export function EntityList({ adventure, api, world }: { adventure: Adventure; api: GameApi; world: boolean }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const kinds: Kind[] = world ? (kind ? [kind] : WORLD) : ['character'];
  const shown = adventure.entities.filter((e) => kinds.includes(e.kind));
  const opened = adventure.entities.find((e) => e.id === open);

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
      {shown.length === 0 && (
        <p className="text-caption text-muted-foreground">
          Nothing yet. {world ? 'Places, items and factions' : 'Characters'} appear here as the story names them, a few turns after they come up.
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
              </span>
              <span className="truncate text-caption font-normal text-muted-foreground">
                {Object.entries(e.state)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ') || e.description}
              </span>
            </span>
          </div>
        </button>
      ))}
      {opened && <EntityDrawer key={opened.id} entity={opened} adventure={adventure} api={api} onClose={() => setOpen(null)} />}
    </>
  );
}
