import { useState } from 'react';
import { andList, loadMemoryJobs } from '@core/memory';
import type { Adventure } from '@core/model';
import { IconClose } from '@ui/components/Icons';
import { Button } from '@ui/components/ui/button';
import { Card } from '@ui/components/ui/card';

type Core = Awaited<ReturnType<typeof loadMemoryJobs>>;

/** "Previously on" after a long break: decided once on mount, gone on the first new action or on close. */
function Recap({ adventure, core: { recap, recapDue } }: { adventure: Adventure; core: Core }) {
  const [shownAt, setShownAt] = useState(() => (recapDue(adventure.actions, Date.now()) ? adventure.actions.length : null));
  if (shownAt === null || adventure.actions.length > shownAt) return null;
  const r = recap(adventure);
  const lines = [
    r.summary,
    r.events.length > 0 && `Lately: ${r.events.map((e) => e.replace(/[.!?]+$/, '')).join('; ')}.`,
    r.present.length > 0 && `With you: ${andList(r.present)}.`,
    r.held.length > 0 && `You hold: ${andList(r.held)}.`,
  ].filter((l): l is string => typeof l === 'string');
  if (lines.length === 0) return null;
  return (
    // A wrapper, not a margin: px-4 is already in the CSS, margins are not.
    <div className="px-4">
      <Card role="note" aria-label="Previously on" className="flex gap-2 p-3 text-caption text-muted-foreground">
        <div className="flex grow flex-col gap-1">
          <p className="font-medium text-foreground">Previously on…</p>
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <Button size="icon" className="size-7 shrink-0" aria-label="Close recap" onClick={() => setShownAt(null)}>
          <IconClose />
        </Button>
      </Card>
    </div>
  );
}

/** For `lazy`: the recap rides the lazy memory jobs chunk; through the start-up index it cost 0.7 kB of chunk splits. */
export async function loadRecapCard() {
  const core = await loadMemoryJobs();
  return { default: ({ adventure }: { adventure: Adventure }) => <Recap adventure={adventure} core={core} /> };
}
