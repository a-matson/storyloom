import { useState } from 'react';
import type { Adventure } from '@core/model';
import type { Provider } from '@core/ports';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { cn } from '@ui/lib/utils';
import { CardsTab } from './CardsTab';
import { DetailsTab } from './DetailsTab';
import { GameplayTab } from './GameplayTab';
import { PlotTab } from './PlotTab';

interface Props {
  adventure: Adventure;
  api: GameApi;
  provider: Provider;
  /** Memory jobs run on a separate utility model. */
  utilityModel: boolean;
  hidden: boolean;
  onClose: () => void;
}

type Tab = 'adventure' | 'gameplay';
type SubTab = 'plot' | 'cards' | 'details';

const TABS: { id: Tab; label: string }[] = [
  { id: 'adventure', label: 'Adventure' },
  { id: 'gameplay', label: 'Gameplay' },
];

const tab =
  'border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-control font-medium text-muted-foreground aria-selected:border-lantern aria-selected:font-semibold aria-selected:text-foreground';
const chip =
  'h-7 rounded-full border border-border bg-transparent px-2.5 text-caption font-medium text-muted-foreground aria-pressed:border-lantern aria-pressed:bg-secondary aria-pressed:text-foreground';
const body = 'flex grow flex-col gap-2 overflow-y-auto px-4 pb-4';

/** Adventure / Gameplay settings panel; an overlay sheet below 1100 px. Mirrors AI Dungeon's in-game settings. */
export function Sidebar({ adventure, api, provider, utilityModel, hidden, onClose }: Props) {
  const [current, setTab] = useState<Tab>('adventure');
  const [sub, setSub] = useState<SubTab>('plot');
  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'plot', label: 'Plot' },
    { id: 'cards', label: `Story cards · ${adventure.storyCards.length}` },
    { id: 'details', label: 'Details' },
  ];
  return (
    <aside
      className={cn(
        'flex w-sidebar shrink-0 flex-col overflow-hidden border-l border-border bg-card',
        'max-[1100px]:fixed max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-15 max-[1100px]:shadow-[-20px_0_60px_rgba(0,0,0,0.4)]',
        hidden && 'hidden',
      )}
      aria-label="Adventure settings"
    >
      <div className="flex gap-1 border-b border-border px-4 pt-3">
        {/* A tablist may only contain tabs, so the close button sits outside it. */}
        <div role="tablist" aria-label="Settings sections" className="contents">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className={tab} aria-selected={current === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="grow" />
        <Button variant="ghost" size="icon" className={cn(tab, 'size-8')} aria-label="Close settings" onClick={onClose}>
          ×
        </Button>
      </div>
      {current === 'adventure' ? (
        <>
          <div className="flex gap-1.5 px-4 py-3">
            {subTabs.map((t) => (
              <button key={t.id} type="button" className={chip} aria-pressed={sub === t.id} onClick={() => setSub(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className={body}>
            {sub === 'plot' && <PlotTab adventure={adventure} api={api} utilityModel={utilityModel} />}
            {sub === 'cards' && <CardsTab adventure={adventure} api={api} provider={provider} />}
            {sub === 'details' && <DetailsTab adventure={adventure} api={api} />}
          </div>
        </>
      ) : (
        <div className={cn(body, 'pt-3')}>
          <GameplayTab adventure={adventure} api={api} />
        </div>
      )}
    </aside>
  );
}
