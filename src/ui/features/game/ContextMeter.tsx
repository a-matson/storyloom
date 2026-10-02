import type { ContextBuildResult } from '@core/context';
import { Button } from '@ui/components/ui/button';
import { SECTION_BG } from './sections';

interface Props {
  ctx: ContextBuildResult | undefined;
  used: number;
  total: number;
  warning: string;
  onOpen: () => void;
}

export function ContextMeter({ ctx, used, total, warning, onOpen }: Props) {
  return (
    <div className="flex w-[150px] flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
        <span>
          Context
          {warning !== '' && (
            <Button
              variant="ghost"
              className="ml-1 h-[18px] border-none px-1 text-caption text-danger"
              onClick={onOpen}
              title={warning}
              aria-label={`Context warning: ${warning}`}
            >
              ⚠
            </Button>
          )}
        </span>
        <span className="font-mono text-caption">
          {(used / 1000).toFixed(1)}k / {(total / 1000).toFixed(0)}k
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-[3px] bg-secondary">
        {ctx ? (
          ctx.sections.map((s) => <span key={s.kind} className={`block h-full ${SECTION_BG[s.kind]}`} style={{ width: `${(s.tokens / total) * 100}%` }} />)
        ) : (
          <span className="block h-full bg-neutral" style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
        )}
      </div>
    </div>
  );
}
