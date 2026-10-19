import { useState } from 'react';
import { genreKeys, repertoire, suggestedBeats } from '@core/director';
import type { Adventure, Entity } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';

const CHIP = 'h-7 px-2 text-caption';

interface Props {
  entity: Entity;
  adventure: Adventure;
  /** `undefined`: back to the genre default. */
  onSet: (beats: readonly string[] | undefined) => void;
}

/** The character's beats as chips, free-text add, the ones play has shown as dashed chips, and Reset. */
export function BeatsRow({ entity: e, adventure, onSet }: Props) {
  const [draft, setDraft] = useState('');
  const genres = genreKeys(adventure);
  const beats = repertoire(e, genres);
  const add = (b: string) => b.trim() && onSet([...beats, b]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {beats.map((b) => (
          <Button key={b} variant="ghost" className={CHIP} aria-label={`Remove ${b}`} onClick={() => onSet(beats.filter((x) => x !== b))}>
            {b} ×
          </Button>
        ))}
        {suggestedBeats(e, adventure.assertions, genres).map((b) => (
          <Button key={b} variant="ghost" className={`${CHIP} border-dashed text-muted-foreground`} aria-label={`Add ${b}`} onClick={() => add(b)}>
            Seen: {b} +
          </Button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          add(draft);
          setDraft('');
        }}
      >
        <Input
          className="h-8 min-w-0 text-caption"
          aria-label={`Add a beat for ${e.name}`}
          placeholder="+ Beat, then Enter"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
        />
        {e.beats !== undefined && (
          <Button variant="ghost" className="h-8 shrink-0 text-caption" onClick={() => onSet(undefined)}>
            Reset
          </Button>
        )}
      </form>
    </div>
  );
}
