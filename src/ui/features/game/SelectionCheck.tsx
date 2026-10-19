import { useState } from 'react';
import { checkSelection, type Finding } from '@app/session/continuity';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { showAction } from './entities/EntityDetails';

/** "Check against the record" for one selection (keyed by its text): the record lines it contradicts, each a jump to its action. */
export function SelectionCheck({ api, text }: { api: GameApi; text: string }) {
  const [found, setFound] = useState<Finding[] | 'running' | null>(null);
  return (
    <>
      <Button
        className="h-8"
        disabled={found === 'running'}
        aria-busy={found === 'running'}
        onClick={() => {
          setFound('running');
          void checkSelection(api, text).then((r) => setFound(r ?? null));
        }}
      >
        {found === 'running' ? 'Checking…' : 'Check against the record'}
      </Button>
      {Array.isArray(found) && (
        <ul
          aria-label="Continuity check"
          className="absolute top-full left-0 mt-1 flex min-w-64 flex-col gap-1 rounded-lg border border-border bg-card p-2 text-sm shadow-lg"
        >
          {found.length === 0 && <li className="text-muted-foreground">No contradiction found</li>}
          {found.map((f) => (
            <li key={f.fact}>
              <button type="button" className="text-left hover:underline" onClick={() => showAction(f.at)}>
                {f.fact} <span className="font-mono text-muted-foreground">— action {f.at}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
