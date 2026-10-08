import { Button } from '@ui/components/ui/button';
import { StatusDot } from '@ui/components/ui/status-dot';
import { TopBar, TopBarTitle } from '@ui/components/ui/top-bar';
import { IconBook, IconSettings } from '@ui/components/Icons';
import { useInstallPrompt } from '@ui/hooks/useInstallPrompt';

interface Props {
  backendLabel: string;
  backendOk: boolean | null;
  onSettings: () => void;
}

export function LibraryHeader({ backendLabel, backendOk, onSettings }: Props) {
  const install = useInstallPrompt();
  const status = backendOk === null ? 'unknown' : backendOk ? 'ok' : 'bad';
  return (
    <TopBar className="h-15 px-8">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-lantern text-lantern-ink">
          <IconBook width={16} height={16} />
        </span>
        <TopBarTitle className="font-semibold">Storyloom</TopBarTitle>
      </div>
      <span className="grow" />
      {install && <Button onClick={install}>Install</Button>}
      <Button onClick={onSettings}>
        <StatusDot status={status} />
        {backendLabel}
        <IconSettings width={14} height={14} />
      </Button>
    </TopBar>
  );
}
