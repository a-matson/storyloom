import { useEffect, useState } from 'react';
import { diceLine } from '@core/dice';
import type { Action } from '@core/model';
import { storage } from '@app/services';

/**
 * The roll behind the last Do, from the newest trace of its reply that logged one (a plain
 * retry logs none and keeps the roll). Re-read when the reply changes (actions are immutable, so a new version is a new object).
 */
export function DiceChip({ adventureId, output }: { adventureId: string; output: Action }) {
  const [line, setLine] = useState<string>();
  useEffect(() => {
    let live = true;
    storage.listTraces(adventureId).then(
      (all) => live && setLine(all.flatMap((t) => (t.actionId === output.id ? [diceLine(t.scriptLogs)] : [])).find(Boolean)),
      (e: unknown) => console.warn('could not read the turn traces for the dice roll', e),
    );
    return () => {
      live = false;
    };
  }, [adventureId, output]);
  if (!line) return null;
  return <p className="m-0 mt-1 font-mono text-caption text-muted-foreground">{line}</p>;
}
