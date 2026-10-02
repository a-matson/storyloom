import { useState } from 'react';
import type { ContextBuildResult } from '@core/context';
import type { Memory } from '@core/model';
import { Segmented } from '@ui/components/ui/drawer';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { byRelevance, byTimeline, classifyMemories, countByStatus, type MemoryRow, type MemoryStatus } from './memoryRows';

const ORDERS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'relevance', label: 'Relevance' },
] as const;

const STATUS_CLASS: Record<MemoryStatus, string> = {
  used: 'bg-mode-say-bg text-verdigris',
  stored: '',
  stale: 'text-warning',
  forgotten: 'text-muted-foreground',
};

const muted = 'text-muted-foreground';
const mono = 'font-mono text-caption';

function Row({ row }: { row: MemoryRow }) {
  const { memory: m, status, score } = row;
  return (
    <div className={cn('flex flex-col gap-1 rounded-md border border-border bg-bar px-3 py-2', status === 'forgotten' && 'opacity-70')}>
      <div className="flex items-center gap-2">
        <span className={`${mono} ${muted}`}>
          actions {m.fromAction + 1}–{m.toAction}
        </span>
        <Pill className={STATUS_CLASS[status]}>{status}</Pill>
        <span className="grow" />
        {score !== undefined && <span className={`${mono} ${muted}`}>score {score.toFixed(2)}</span>}
        <span className={`${mono} ${muted}`}>used {m.useCount}×</span>
      </div>
      <div className="text-caption text-prose">{m.text}</div>
    </div>
  );
}

/**
 * The adventure's memory bank against the last prompt. Statuses and scores are those of the
 * prompt that was built; stale/forgotten reflect the bank now.
 */
export function MemoriesView({ result, memories }: { result: ContextBuildResult; memories: Memory[] }) {
  const [order, setOrder] = useState<'timeline' | 'relevance'>('timeline');
  const rows = classifyMemories(memories, result.usedMemories, result.rankedMemories);
  const counts = countByStatus(rows);
  const sorted = order === 'timeline' ? byTimeline(rows) : byRelevance(rows);
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grow text-caption text-muted-foreground" data-testid="memory-counts">
          used {counts.used} · stored {counts.stored} · stale {counts.stale} · forgotten {counts.forgotten}
        </span>
        <Segmented value={order} options={[...ORDERS]} onChange={setOrder} />
      </div>
      {rows.length === 0 ? (
        <div className={`text-caption ${muted}`}>No memories yet. The first is written once the adventure is 12 actions deep.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sorted.map((r) => (
            <Row key={r.memory.id} row={r} />
          ))}
        </div>
      )}
    </>
  );
}
