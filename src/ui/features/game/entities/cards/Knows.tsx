import { useState } from 'react';
import { loadMemoryJobs } from '@core/memory';
import type { Adventure, Entity } from '@core/model';
import { Button } from '@ui/components/ui/button';

type Jobs = Awaited<ReturnType<typeof loadMemoryJobs>>;

/** Every event they saw, heard or were told (`knowledgeOf`); loaded on first open, off the start-up chunk. */
export function Knows({ entity: e, adventure, onShow }: { entity: Entity; adventure: Adventure; onShow: (i: number) => void }) {
  const [jobs, setJobs] = useState<Jobs | null>(null);
  const [error, setError] = useState('');
  const known = jobs?.knowledgeOf(e.id, adventure) ?? [];
  const toggle = (shown: boolean) => {
    if (shown && !jobs) loadMemoryJobs().then(setJobs, (x: unknown) => setError(x instanceof Error ? x.message : String(x)));
  };
  return (
    <details onToggle={(ev) => toggle(ev.currentTarget.open)}>
      <summary className="cursor-pointer text-caption">What does {e.name} know?</summary>
      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0 text-caption">
        {error && <li role="alert">{error}</li>}
        {jobs && known.length === 0 && <li>Nothing they saw or were told yet.</li>}
        {known.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-2">
            {a.text}
            <Button variant="ghost" className="h-7 shrink-0 font-mono" aria-label={`Show action ${a.at} in the story`} onClick={() => onShow(a.at)}>
              action {a.at}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
