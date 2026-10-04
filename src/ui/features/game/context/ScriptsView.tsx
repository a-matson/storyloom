import { useEffect, useState } from 'react';
import type { ScriptState } from '@core/model';
import { storage } from '@app/services';

/** `state` as the scripts last left it, plus the log lines of the most recent turn. */
export function ScriptsView({ adventureId, state }: { adventureId: string; state: ScriptState }) {
  const [logs, setLogs] = useState<string[] | 'loading' | 'failed'>('loading');
  useEffect(() => {
    let live = true;
    storage.listTraces(adventureId).then(
      (all) => live && setLogs(all[0]?.scriptLogs ?? []),
      (e: unknown) => {
        console.warn('could not read the turn traces for the script log', e);
        if (live) setLogs('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [adventureId]);

  return (
    <>
      <h3 className="m-0 text-control font-semibold">Script state</h3>
      <pre className="m-0 font-mono text-caption whitespace-pre-wrap text-prose">{JSON.stringify(state, null, 2)}</pre>
      <h3 className="m-0 text-control font-semibold">Script log (last turn)</h3>
      {logs === 'loading' && <p className="m-0 text-muted-foreground">Loading…</p>}
      {logs === 'failed' && <p className="m-0 text-destructive">The turn traces could not be read.</p>}
      {Array.isArray(logs) &&
        (logs.length === 0 ? (
          <p className="m-0 text-caption text-muted-foreground">No script output on the last turn.</p>
        ) : (
          <pre className="m-0 font-mono text-caption whitespace-pre-wrap text-prose">{logs.join('\n')}</pre>
        ))}
    </>
  );
}
