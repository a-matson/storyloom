import { useState } from 'react';
import type { ContextBuildResult } from '@core/context';
import type { Memory } from '@core/model';
import type { CompletionStats } from '@core/ports';
import { Drawer, DrawerBody, DrawerHeader, Segmented } from '@ui/components/ui/drawer';
import { TopBarTitle } from '@ui/components/ui/top-bar';
import { BudgetView } from './BudgetView';
import { MemoriesView } from './MemoriesView';
import { StatsFooter } from './StatsFooter';

interface Props {
  result: ContextBuildResult;
  prompt: string;
  /** The adventure's memory bank, for the Memories tab. */
  memories: Memory[];
  /** Backend statistics for the last generation, when available. */
  stats?: CompletionStats | undefined;
  onClose: () => void;
}

const VIEWS = [
  { id: 'budget', label: 'Budget' },
  { id: 'memories', label: 'Memories' },
  { id: 'raw', label: 'Raw prompt' },
] as const;

/** What was sent to the model: budget, cards, memories, raw prompt, timings. */
export function ContextViewer({ result, prompt, memories, stats, onClose }: Props) {
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('budget');
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
        <Segmented value={view} options={[...VIEWS]} onChange={setView} />
      </DrawerHeader>
      <DrawerBody>
        {view === 'budget' && <BudgetView result={result} />}
        {view === 'memories' && <MemoriesView result={result} memories={memories} />}
        {view === 'raw' && <pre className="m-0 font-mono text-caption whitespace-pre-wrap text-prose">{prompt}</pre>}
      </DrawerBody>
      {stats && <StatsFooter stats={stats} />}
    </Drawer>
  );
}
