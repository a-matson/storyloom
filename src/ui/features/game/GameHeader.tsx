import type { ReactNode } from 'react';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { StatusDot } from '@ui/components/ui/status-dot';
import { TopBar, TopBarTitle } from '@ui/components/ui/top-bar';
import { IconHome, IconRedo, IconSettings, IconUndo } from '@ui/components/Icons';

interface Props {
  title: string;
  actionCount: number;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  failed: boolean;
  modelLabel: string;
  meter: ReactNode;
  sidebarOpen: boolean;
  api: GameApi;
  onExit: () => void;
  onToggleSidebar: () => void;
}

export function GameHeader({ title, actionCount, busy, canUndo, canRedo, failed, modelLabel, meter, sidebarOpen, api, onExit, onToggleSidebar }: Props) {
  return (
    <TopBar>
      <Button size="icon" className="shrink-0" aria-label="Back to library" onClick={onExit}>
        <IconHome />
      </Button>
      <div className="flex min-w-0 flex-col gap-px">
        <TopBarTitle className="truncate">{title === '' ? 'Untitled adventure' : title}</TopBarTitle>
        <div className="text-caption text-muted-foreground">{actionCount} actions</div>
      </div>
      <span className="grow" />
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="icon" aria-label="Undo" onClick={api.undo} disabled={busy || !canUndo}>
          <IconUndo />
        </Button>
        <Button size="icon" aria-label="Redo" onClick={api.redo} disabled={busy || !canRedo}>
          <IconRedo />
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-secondary px-3 py-1.5 max-sm:max-w-28">
        <StatusDot status={failed ? 'bad' : 'ok'} />
        <span className="truncate text-caption font-medium" title={modelLabel}>
          {modelLabel}
        </span>
      </div>
      {meter}
      <Button size="icon" className="shrink-0" aria-label="Adventure settings" aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
        <IconSettings />
      </Button>
    </TopBar>
  );
}
