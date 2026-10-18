import { useEffect, useState } from 'react';
import { closeSheets, roundSheet, sheetRequest, type Sheet } from '@app/session/builder';
import type { Adventure } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { progressText, useImageProgress } from '@ui/hooks/useImageProgress';
import { Button } from '@ui/components/ui/button';

type Status = 'drawing' | { error: string } | undefined;

/** Draws a round sheet on request; closing the builder (unmount) deletes its sheets. */
export function useRoundSheet(api: GameApi, id: string) {
  const [status, setStatus] = useState<Status>();
  const [sheet, setSheet] = useState<Sheet>();
  useEffect(() => () => closeSheets(api, id), [api, id]);
  const run = async (skipped: readonly string[]) => {
    setStatus('drawing');
    try {
      const s = await roundSheet(api, id, skipped);
      if (s) setSheet(s);
      setStatus(undefined);
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  const draw = (skipped: readonly string[]) => void run(skipped);
  return { status, sheet, draw };
}

interface Props extends ReturnType<typeof useRoundSheet> {
  adventure: Adventure;
  id: string;
  skipped: readonly string[];
}

/** The last round's sheet; Draw again once an answer changed what it would show, or after a failure. */
export function RoundSheet({ adventure, id, skipped, status, sheet, draw }: Props) {
  const src = useImageBlob(adventure.id, sheet?.imageId);
  const p = useImageProgress('sheet');
  const stale = sheet !== undefined && sheet.prompt !== sheetRequest(adventure, id, skipped).prompt;
  if (status === undefined && sheet === undefined) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {src !== undefined && <img src={src} alt="Character sheet" className="max-w-full rounded-lg bg-white" />}
      {status === 'drawing' && <p className="text-caption text-muted-foreground">Drawing the sheet…{p && ` ${progressText(p)}`}</p>}
      {typeof status === 'object' && <p className="text-caption text-danger">Could not draw the sheet: {status.error}</p>}
      {status !== 'drawing' && (stale || typeof status === 'object') && (
        <Button className="self-start" onClick={() => draw(skipped)}>
          Draw again
        </Button>
      )}
    </div>
  );
}
