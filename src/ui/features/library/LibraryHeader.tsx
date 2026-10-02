import { Button } from '@ui/components/ui/button';
import { StatusDot } from '@ui/components/ui/status-dot';
import { IconBook, IconSettings } from '@ui/components/Icons';

interface Props {
  backendLabel: string;
  backendOk: boolean | null;
  onSettings: () => void;
}

export function LibraryHeader({ backendLabel, backendOk, onSettings }: Props) {
  const status = backendOk === null ? 'unknown' : backendOk ? 'ok' : 'bad';
  return (
    <header className="flex h-15 shrink-0 items-center gap-4 border-b border-border bg-bar px-8 max-sm:gap-2 max-sm:px-3">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-lantern text-lantern-ink">
          <IconBook width={16} height={16} />
        </span>
        <span className="font-display text-screen-title leading-[1.2] font-semibold">Storyloom</span>
      </div>
      <span className="grow" />
      <Button onClick={onSettings}>
        <StatusDot status={status} />
        {backendLabel}
        <IconSettings width={14} height={14} />
      </Button>
    </header>
  );
}
