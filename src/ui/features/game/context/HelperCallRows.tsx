import { useEffect, useState } from 'react';
import type { HelperCall } from '@core/model';
import { storage } from '@app/services';
import { SectionLabel } from '@ui/components/ui/section-label';

interface Props {
  adventureId: string;
  /** This turn's start. */
  from: number;
  /** The next turn's start; the reads of this turn's output end before it. */
  to: number;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The helper reads that ran after this turn: what each one returned, and what its guards kept. */
export function HelperCallRows({ adventureId, from, to }: Props) {
  const [calls, setCalls] = useState<HelperCall[] | string>([]);
  useEffect(() => {
    let live = true;
    storage.listHelperCalls(adventureId).then(
      (all) => live && setCalls(all.filter((c) => c.createdAt >= from && c.createdAt < to).toReversed()),
      (e: unknown) => live && setCalls(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [adventureId, from, to]);

  if (typeof calls === 'string') return <p className="m-0 text-caption text-destructive">{calls}</p>;
  if (!calls.length) return null;
  return (
    <>
      <SectionLabel>Helper calls</SectionLabel>
      <div className="flex flex-col gap-2">
        {calls.map((c) => (
          <details key={c.id} className="text-caption">
            <summary className="cursor-pointer font-mono text-prose">
              {[
                c.job,
                c.model,
                seconds(c.ms),
                `${c.generatedTokens} tok`,
                c.cut ? 'cut' : c.stopReason,
                `kept ${c.accepted}`,
                c.rejected.length ? `dropped ${c.rejected.length}` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </summary>
            <pre className="m-0 mt-1 font-mono whitespace-pre-wrap text-muted-foreground">{c.reply || '(empty reply)'}</pre>
            {c.rejected.map((r) => (
              <p key={`${r.value}|${r.reason}`} className="m-0 font-mono text-muted-foreground">
                dropped {r.value} ({r.reason})
              </p>
            ))}
          </details>
        ))}
      </div>
    </>
  );
}
