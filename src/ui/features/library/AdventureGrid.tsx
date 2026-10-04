import type { AdventureSummary } from '@core/ports';
import { CoverThumb } from '@ui/components/CoverThumb';
import { Button } from '@ui/components/ui/button';
import { timeAgo } from './timeAgo';

interface Props {
  adventures: AdventureSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AdventureGrid({ adventures, onOpen, onDelete }: Props) {
  return (
    <>
      {adventures.length === 0 && <p className="text-caption text-muted-foreground">Nothing here yet.</p>}
      <div className="grid grid-cols-4 gap-4 max-[1100px]:grid-cols-2 max-sm:grid-cols-1">
        {adventures.map((a) => (
          <div key={a.id} className="relative flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 text-foreground hover:border-neutral">
            <button type="button" className="border-none bg-transparent p-0" aria-label={`Open ${a.title}`} onClick={() => onOpen(a.id)}>
              <CoverThumb ownerId={a.id} coverId={a.coverId} coverUrl={a.coverUrl} className="h-27.5" />
            </button>
            <button type="button" className="border-none bg-transparent p-0 text-left font-display text-card-title font-medium" onClick={() => onOpen(a.id)}>
              {a.title}
            </button>
            <div className="flex items-center gap-2 text-caption text-muted-foreground">
              <span>
                {a.actionCount} actions · {timeAgo(a.updatedAt)}
              </span>
              <span className="grow" />
              <Button variant="ghost" danger className="h-6 px-2 text-label" onClick={() => onDelete(a.id)}>
                delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
