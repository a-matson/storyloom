import { useState } from 'react';
// Not through the barrel: that would pull the session out of the start-up chunk into a shared one.
import { memoryEdits } from '@app/session/memories';
import type { ContextBuildResult } from '@core/context';
import type { Memory } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Segmented } from '@ui/components/ui/drawer';
import { Pill } from '@ui/components/ui/pill';
import { Textarea } from '@ui/components/ui/textarea';
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

type Edits = ReturnType<typeof memoryEdits>;

function Row({ row, edits }: { row: MemoryRow; edits: Edits }) {
  const { memory: m, status, score } = row;
  const [draft, setDraft] = useState<string | null>(null);
  const range = `actions ${m.fromAction + 1}–${m.toAction}`;
  return (
    <div className={cn('flex flex-col gap-1 rounded-md border border-border bg-bar px-3 py-2', status === 'forgotten' && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${mono} ${muted}`}>{range}</span>
        <Pill className={STATUS_CLASS[status]}>{status}</Pill>
        {m.pinned && <Pill tone="auto">pinned</Pill>}
        <span className="grow" />
        {score !== undefined && <span className={`${mono} ${muted}`}>score {score.toFixed(2)}</span>}
        <span className={`${mono} ${muted}`}>used {m.useCount}×</span>
      </div>
      {draft === null ? (
        <div className="text-caption text-prose">{m.text}</div>
      ) : (
        <Textarea aria-label={`Edit memory, ${range}`} value={draft} onChange={(e) => setDraft(e.target.value)} />
      )}
      <div className="flex gap-1.5">
        {draft === null ? (
          <>
            <Button
              variant="ghost"
              className="h-7 aria-pressed:border-lantern"
              aria-pressed={!!m.pinned}
              aria-label={`Pin memory, ${range}`}
              onClick={() => edits.pin(m.id, !m.pinned)}
            >
              Pin
            </Button>
            <Button variant="ghost" className="h-7" aria-label={`Edit memory, ${range}`} onClick={() => setDraft(m.text)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              className="h-7"
              aria-label={`${m.forgotten ? 'Restore' : 'Forget'} memory, ${range}`}
              onClick={() => edits.forget(m.id, !m.forgotten)}
            >
              {m.forgotten ? 'Restore' : 'Forget'}
            </Button>
          </>
        ) : (
          <>
            <Button
              className="h-7"
              disabled={!draft.trim()}
              onClick={() => {
                edits.edit(m.id, draft.trim());
                setDraft(null);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" className="h-7" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The adventure's memory bank against the last prompt. Statuses and scores are those of the
 * prompt that was built; stale/forgotten reflect the bank now.
 */
export function MemoriesView({ result, memories, api }: { result: ContextBuildResult; memories: Memory[]; api: GameApi }) {
  const [order, setOrder] = useState<'timeline' | 'relevance'>('timeline');
  const edits = memoryEdits(api);
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
            <Row key={r.memory.id} row={r} edits={edits} />
          ))}
        </div>
      )}
    </>
  );
}
