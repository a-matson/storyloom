import { useState } from 'react';
import type { ContextBuildResult } from '@core/context';
import { hasScripts, type Adventure } from '@core/model';
import type { CompletionStats } from '@core/ports';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Drawer, DrawerBody, DrawerHeader, Segmented } from '@ui/components/ui/drawer';
import { TopBarTitle } from '@ui/components/ui/top-bar';
import { BudgetView } from './BudgetView';
import { MemoriesView } from './MemoriesView';
import { ScriptsView } from './ScriptsView';
import { StatsFooter } from './StatsFooter';

interface Props {
  result: ContextBuildResult;
  prompt: string;
  /** The adventure itself: its memory bank for Memories, its script state for Inspect. */
  adventure: Adventure;
  /** Backend statistics for the last generation, when available. */
  stats?: CompletionStats | undefined;
  /** For the Memories tab's pin / edit / forget. */
  api: GameApi;
  onClose: () => void;
}

const VIEWS = [
  { id: 'budget', label: 'Budget' },
  { id: 'memories', label: 'Memories' },
  { id: 'raw', label: 'Raw prompt' },
  { id: 'inspect', label: 'Inspect' },
] as const;

/** What was sent to the model: budget, cards, memories, raw prompt, timings; Inspect only when the story has scripts. */
export function ContextViewer({ result, prompt, adventure, stats, api, onClose }: Props) {
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('budget');
  const views = [...VIEWS].filter((v) => v.id !== 'inspect' || hasScripts(adventure.scripts));
  const title = (
    <div className="flex flex-col gap-0.5">
      <TopBarTitle>Context sent to the model</TopBarTitle>
      <div className="text-caption text-muted-foreground">
        <span className="font-mono text-caption">
          {result.budget.used.toLocaleString()} / {result.budget.total.toLocaleString()} tokens
        </span>{' '}
        · counted by the backend when it can tokenize
      </div>
    </div>
  );
  return (
    <Drawer label="Context sent to the model" onClose={onClose}>
      <DrawerHeader title={title} onClose={onClose}>
        <Segmented value={view} options={views} onChange={setView} />
      </DrawerHeader>
      <DrawerBody>
        {view === 'budget' && <BudgetView result={result} />}
        {view === 'memories' && <MemoriesView result={result} memories={adventure.memories} api={api} />}
        {view === 'raw' && <pre className="m-0 font-mono text-caption whitespace-pre-wrap text-prose">{prompt}</pre>}
        {view === 'inspect' && <ScriptsView adventureId={adventure.id} state={adventure.scriptState} />}
      </DrawerBody>
      {stats && <StatsFooter stats={stats} />}
    </Drawer>
  );
}
