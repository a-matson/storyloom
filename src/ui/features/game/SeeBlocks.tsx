import { useEffect, useState } from 'react';
import { BLOCKS, type Block } from '@core/image';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Switch } from '@ui/components/ui/switch';

interface Props {
  id: string;
  brief: string;
  busy: boolean;
  api: GameApi;
}

type Composed = Awaited<ReturnType<GameApi['seeBlocks']>>;

/** What the brief composes, block by block; a block switched off is left out of the next render. */
export function SeeBlocks({ id, brief, busy, api }: Props) {
  const [composed, setComposed] = useState<Composed>();
  const [off, setOff] = useState<ReadonlySet<Block>>(new Set());
  useEffect(() => {
    let live = true;
    void api.seeBlocks(id).then(
      (c) => live && setComposed(c),
      (e: unknown) => api.onError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [api, id]);
  if (!composed) return null;
  const toggle = (k: Block, on: boolean) => setOff((s) => new Set([...s].filter((x) => x !== k).concat(on ? [] : [k])));
  return (
    <div className="mt-1.5 flex w-full flex-col items-start gap-1">
      {BLOCKS.map((k) => (
        <div key={k} className="flex w-full items-center gap-2">
          <Switch id={`see-${id}-${k}`} checked={!off.has(k)} onChange={(on) => toggle(k, on)} />
          <label htmlFor={`see-${id}-${k}`} className="w-14 shrink-0 capitalize">
            {k}
          </label>
          <span className="min-w-0 flex-1 break-words text-foreground">{composed.blocks[k] || '—'}</span>
        </div>
      ))}
      {composed.dropped.length > 0 && <p>Dropped for length: {composed.dropped.join(', ')}</p>}
      <Button className="h-7 px-2.5 text-caption" disabled={busy || off.size === 0} onClick={() => api.regenerateSee(id, brief, off)}>
        Generate without
      </Button>
    </div>
  );
}
