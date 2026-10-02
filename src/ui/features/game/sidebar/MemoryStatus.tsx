import type { Adventure } from '@core/model';
import { Card } from '@ui/components/ui/card';
import { SectionLabel } from '@ui/components/ui/section-label';

// [provisional] memory cadence shown to the player; mirrors the scheduler's defaults.
const FIRST_MEMORY_AT = 12;
const MEMORY_EVERY = 6;

export function MemoryStatus({ adventure }: { adventure: Adventure }) {
  const m = adventure.settings.memory;
  const count = adventure.actions.length;
  const nextMemoryIn = MEMORY_EVERY - ((count - FIRST_MEMORY_AT) % MEMORY_EVERY);
  const fill = Math.min(100, (adventure.memories.length / Math.max(1, m.bankSize)) * 100);
  return (
    <Card className="flex flex-col gap-2 bg-bar">
      <div className="flex items-center gap-2">
        <SectionLabel>Memory</SectionLabel>
        <span className="grow" />
        <span className="font-mono text-caption text-muted-foreground">
          bank {adventure.memories.length} / {m.bankSize}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-[3px] bg-secondary">
        <span className="block h-full bg-verdigris" style={{ width: `${fill}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-caption text-prose">
        <span>{m.autoSummary ? 'Auto summary on' : 'Auto summary off'}</span>
        <span>{count >= FIRST_MEMORY_AT ? `next memory in ${nextMemoryIn} actions` : `first memory at ${FIRST_MEMORY_AT} actions`}</span>
      </div>
    </Card>
  );
}
