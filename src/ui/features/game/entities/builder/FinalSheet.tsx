import { useState } from 'react';
import { finish, sheetRequest } from '@app/session/builder';
import { familyOf } from '@core/image';
import type { Adventure } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { progressText, useImageProgress } from '@ui/hooks/useImageProgress';
import { IMAGE_HELP, SD15_SHEET_NOTE } from '../../sidebar/settingHelp';

type Status = 'drawing' | { error: string } | undefined;

/** Done: draws the final sheet and portrait, then closes; a failure keeps the builder open. */
export function useFinish(api: GameApi, id: string, onClose: () => void) {
  const [status, setStatus] = useState<Status>();
  const run = async (skipped: readonly string[]) => {
    setStatus('drawing');
    try {
      await finish(api, id, skipped);
      onClose();
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  return { status, run: (skipped: readonly string[]) => void run(skipped) };
}

interface Props {
  adventure: Adventure;
  id: string;
  skipped: readonly string[];
  status: Status;
}

/** Progress, and the Settings warnings that would blank or distort the final sheet (its size is the hires output). */
export function FinalSheet({ adventure, id, skipped, status }: Props) {
  const p = useImageProgress('sheet');
  const s = adventure.settings.image;
  const r = sheetRequest(adventure, id, skipped);
  const warnings = [
    familyOf(s.model, s.width, s.height) === 'sd15' ? SD15_SHEET_NOTE : undefined,
    IMAGE_HELP.clipSkip.warn?.(s.clipSkip, s),
    IMAGE_HELP.height.warn?.(r.height * s.hiresScale, { ...s, width: r.width * s.hiresScale }),
    IMAGE_HELP.hiresDenoise.warn?.(s.hiresDenoise, s),
  ].filter(Boolean);
  return (
    <>
      {warnings.map((w) => (
        <p key={w} className="text-caption text-muted-foreground">
          {w}
        </p>
      ))}
      {status === 'drawing' && <p className="text-caption text-muted-foreground">Drawing the final sheet and portrait…{p && ` ${progressText(p)}`}</p>}
      {typeof status === 'object' && <p className="text-caption text-danger">Could not finish: {status.error}</p>}
    </>
  );
}
