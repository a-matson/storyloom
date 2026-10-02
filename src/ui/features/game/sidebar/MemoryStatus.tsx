import { actionsUntilMemory, MEMORY_LAG } from '@core/memory';
import type { Adventure } from '@core/model';
import { Card } from '@ui/components/ui/card';
import { SectionLabel } from '@ui/components/ui/section-label';

export function MemoryStatus({ adventure, utilityModel }: { adventure: Adventure; utilityModel: boolean }) {
  const m = adventure.settings.memory;
  const count = adventure.actions.length;
  const nextMemoryIn = actionsUntilMemory(count, adventure.memories);
  const cadence =
    !adventure.memories.length && count < MEMORY_LAG
      ? `first memory at ${MEMORY_LAG} actions`
      : nextMemoryIn
        ? `next memory in ${nextMemoryIn} actions`
        : 'memory due';
  const inBank = adventure.memories.filter((x) => !x.forgotten).length;
  const fill = Math.min(100, (inBank / Math.max(1, m.bankSize)) * 100);
  return (
    <Card className="flex flex-col gap-2 bg-bar">
      <div className="flex items-center gap-2">
        <SectionLabel>Memory</SectionLabel>
        <span className="grow" />
        <span className="font-mono text-caption text-muted-foreground">
          bank {inBank} / {m.bankSize}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-[3px] bg-secondary">
        <span className="block h-full bg-verdigris" style={{ width: `${fill}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-caption text-prose">
        <span>{m.autoSummary ? 'Auto summary on' : 'Auto summary off'}</span>
        <span>{cadence}</span>
      </div>
      <span className="text-caption text-muted-foreground">summaries: {utilityModel ? 'utility model' : 'story model'}</span>
    </Card>
  );
}
