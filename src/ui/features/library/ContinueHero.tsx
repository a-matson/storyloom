import type { AdventureSummary } from '@core/ports';
import { buttonClass } from '@ui/components/ui/button';
import { SectionLabel } from '@ui/components/ui/section-label';
import { timeAgo } from './timeAgo';

interface Props {
  latest: AdventureSummary | undefined;
  backendOk: boolean | null;
  onOpen: (id: string) => void;
}

/** The most recent adventure, or a first-run prompt when there is none. */
export function ContinueHero({ latest, backendOk, onOpen }: Props) {
  if (!latest) {
    return (
      <div className="flex grow items-center rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-title font-medium">Start your first adventure</h1>
          <p className="m-0 text-muted-foreground">
            Pick a quick start on the right, or write your own opening. {backendOk === false && 'Connect a backend in Settings first.'}
          </p>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="flex grow flex-row items-center gap-5 rounded-lg border border-border bg-card p-5 text-left text-foreground hover:border-neutral"
      onClick={() => onOpen(latest.id)}
    >
      <div className="h-30 w-45 shrink-0 rounded-md bg-secondary" />
      <div className="flex grow flex-col gap-1.5">
        <SectionLabel className="text-lantern">Continue</SectionLabel>
        <span className="font-display text-title font-medium">{latest.title}</span>
        <span className="text-caption text-muted-foreground">
          {latest.actionCount} actions · {latest.modelId ?? 'local model'} · {timeAgo(latest.updatedAt)}
        </span>
      </div>
      <span className={buttonClass({ variant: 'primary', size: 'lg' }, 'pointer-events-none')}>Resume</span>
    </button>
  );
}
