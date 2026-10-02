import type { ProviderConfig } from '@core/model';
import { cn } from '@ui/lib/utils';
import { BACKENDS } from './backends';

interface Props {
  kind: ProviderConfig['kind'];
  onPick: (kind: ProviderConfig['kind'], url: string) => void;
}

export function BackendTiles({ kind, onPick }: Props) {
  return (
    <div className="grid grid-cols-4 gap-4 max-[1100px]:grid-cols-2 max-sm:grid-cols-1">
      {BACKENDS.map((k) => (
        <button
          key={k.kind}
          type="button"
          className={cn(
            'flex flex-col gap-2.5 rounded-lg border p-3.5 text-left text-foreground hover:border-neutral',
            kind === k.kind ? 'border-lantern bg-secondary hover:border-lantern' : 'border-border bg-card',
          )}
          onClick={() => onPick(k.kind, k.url)}
        >
          <span className="font-semibold">{k.name}</span>
          <span className="text-caption text-muted-foreground">{k.blurb}</span>
        </button>
      ))}
    </div>
  );
}
