import { useState } from 'react';
import type { ContextBuildResult } from '@core/context';
import type { CompletionStats } from '@core/ports';
import { Drawer, DrawerBody, DrawerHeader, Segmented } from '@ui/components/ui/drawer';
import { BudgetView } from './BudgetView';
import { StatsFooter } from './StatsFooter';

interface Props {
  result: ContextBuildResult;
  prompt: string;
  /** Backend statistics for the last generation, when available. */
  stats?: CompletionStats | undefined;
  onClose: () => void;
}

const VIEWS = [
  { id: 'budget', label: 'Budget' },
  { id: 'raw', label: 'Raw prompt' },
] as const;

/** What was sent to the model: budget, cards, memories, raw prompt, timings. */
export function ContextViewer({ result, prompt, stats, onClose }: Props) {
  const [view, setView] = useState<'budget' | 'raw'>('budget');
  const title = (
    <div className="flex flex-col gap-0.5">
      <div>Context sent to the model</div>
      <div className="text-caption text-muted-foreground">
        <span className="font-mono text-caption">
          {result.budget.used.toLocaleString()} / {result.budget.total.toLocaleString()} tokens
        </span>{' '}
        · estimates calibrated against the backend
      </div>
    </div>
  );
  return (
    <Drawer label="Context sent to the model" onClose={onClose}>
      <DrawerHeader title={title} onClose={onClose}>
        <Segmented value={view} options={[...VIEWS]} onChange={setView} />
      </DrawerHeader>
      <DrawerBody>
        {view === 'budget' ? <BudgetView result={result} /> : <pre className="m-0 font-mono text-caption whitespace-pre-wrap text-prose">{prompt}</pre>}
      </DrawerBody>
      {stats && <StatsFooter stats={stats} />}
    </Drawer>
  );
}
