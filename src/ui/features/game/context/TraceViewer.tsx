import { useEffect, useState } from 'react';
import type { TurnTrace } from '@core/model';
import { storage } from '@app/services';
import { Drawer, DrawerBody, DrawerHeader, Segmented } from '@ui/components/ui/drawer';
import { TopBarTitle } from '@ui/components/ui/top-bar';
import { HelperCallRows } from './HelperCallRows';
import { TraceSummary } from './TraceSummary';

interface Props {
  adventureId: string;
  actionId: string;
  onClose: () => void;
}

const VIEWS = [
  { id: 'summary', label: 'Summary' },
  { id: 'prompt', label: 'Prompt' },
] as const;

/** `nextAt`: when the next turn started, so the helper calls between the two belong to this one. */
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; trace: TurnTrace | undefined; nextAt: number };

/** The record of the latest generation for one action; a retry has its own trace, so the newest wins. */
export function TraceViewer({ adventureId, actionId, onClose }: Props) {
  const [view, setView] = useState<'summary' | 'prompt'>('summary');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    storage.listTraces(adventureId).then(
      (all) => {
        // Newest first: the trace before this one in the list started after it.
        const at = all.findIndex((t) => t.actionId === actionId);
        return live && setLoad({ state: 'done', trace: all[at], nextAt: (at > 0 ? all[at - 1]?.createdAt : undefined) ?? Infinity });
      },
      (e: unknown) => live && setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [adventureId, actionId]);

  const trace = load.state === 'done' ? load.trace : undefined;
  return (
    <Drawer label="Turn trace" onClose={onClose}>
      <DrawerHeader title={<TopBarTitle>Turn trace</TopBarTitle>} onClose={onClose}>
        {trace && <Segmented value={view} options={[...VIEWS]} onChange={setView} />}
      </DrawerHeader>
      <DrawerBody>
        {load.state === 'loading' && <p className="m-0 text-muted-foreground">Loading…</p>}
        {load.state === 'error' && <p className="m-0 text-destructive">{load.message}</p>}
        {load.state === 'done' && !trace && <p className="m-0 text-muted-foreground">No trace was recorded for this action.</p>}
        {trace && view === 'summary' && (
          <>
            <TraceSummary trace={trace} />
            {load.state === 'done' && <HelperCallRows adventureId={adventureId} from={trace.createdAt} to={load.nextAt} />}
          </>
        )}
        {trace && view === 'prompt' && (
          <>
            {trace.promptTruncated && (
              <p className="m-0 text-caption text-muted-foreground">Showing the end of the prompt: {trace.promptChars.toLocaleString()} chars were sent.</p>
            )}
            <pre className="m-0 font-mono text-caption whitespace-pre-wrap text-prose">{trace.prompt}</pre>
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}
