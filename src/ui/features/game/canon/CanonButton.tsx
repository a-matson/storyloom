import { lazy, Suspense, useState } from 'react';
import type { Adventure } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';

const CanonDrawer = lazy(async () => ({ default: (await import('./CanonDrawer')).CanonDrawer }));

/** Shown before turn 1 only; no persisted flag: it goes once a turn exists. */
export function CanonHint({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  return (
    // A div: the drawer mounts inside it, and a <p> cannot hold its <header>.
    <div className="flex items-center gap-2 px-4 text-caption text-muted-foreground">
      Set who is who before you play → <CanonButton className="h-7" adventure={adventure} api={api} />
    </div>
  );
}

/** Opens the canon drawer, loaded on first open; the drawer is a modal, so it can live under any parent. */
export function CanonButton({ adventure, api, className }: { adventure: Adventure; api: GameApi; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        Canon
      </Button>
      {open && (
        <Suspense fallback={null}>
          <CanonDrawer adventure={adventure} api={api} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
