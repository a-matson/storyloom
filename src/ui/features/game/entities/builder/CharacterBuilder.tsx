import { useId, useState } from 'react';
import { draftOf, nextRound, saveDraft, type Draft } from '@app/session/builder';
import { lineEdits } from '@app/session/lines';
import { currentStates, indexAssertions, isComplete, REQUIRED, SHEET_KEYS, statusOf, type SheetKey } from '@core/memory';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { Input } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { cn } from '@ui/lib/utils';

interface Props {
  entity: Entity;
  adventure: Adventure;
  api: GameApi;
  onClose: () => void;
}

// Here, not in core: start-up code imports the memory barrel.
const QUESTIONS: Record<SheetKey, string> = {
  species: 'What are they? (human, fox, elf…)',
  build: 'How tall and how built are they?',
  skin: 'What colour is their skin, fur or hide?',
  eyes: 'What are their eyes like?',
  hair: 'Hair colour and style?',
  face: 'What stands out about their face?',
  horns: 'Any horns?',
  scales: 'Any scales?',
  marks: 'Scars, tattoos or other marks?',
  wearing: 'What are they wearing?',
  accessories: 'What do they carry or wear besides clothes?',
  palette: 'Which colours run through the whole look?',
};

/** A character's looks asked a few keys a round; every answer is the player's value at once, so closing loses nothing. */
export function CharacterBuilder({ entity: e, adventure, api, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => draftOf(api, e.id));
  const update = (d: Draft) => {
    saveDraft(e.id, d);
    setDraft(d);
  };
  const own = indexAssertions(adventure.assertions).of(e.id);
  const now = currentStates(own);
  const answer = (k: SheetKey, v: string) => v !== (now[k] ?? '') && lineEdits(api).setValue(e.id, k, v);
  const skip = (k: SheetKey) => update({ ...draft, asked: draft.asked.filter((x) => x !== k), skipped: [...draft.skipped, k] });
  // A key from the checklist joins this round; asking a skipped one again un-skips it.
  const refine = (k: SheetKey) =>
    update({ ...draft, asked: draft.asked.includes(k) ? draft.asked : [...draft.asked, k], skipped: draft.skipped.filter((x) => x !== k) });
  const statusText = (k: SheetKey) => (draft.skipped.includes(k) ? 'skipped' : { filled: 'answered', vague: 'vague', missing: 'missing' }[statusOf(now, k)]);

  return (
    <Drawer label={`Build ${e.name}`} onClose={onClose}>
      <DrawerHeader title={<span className="text-card-title font-semibold">Build {e.name}</span>} onClose={onClose} />
      <DrawerBody>
        <SectionLabel>Checklist</SectionLabel>
        <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 max-sm:grid-cols-1" aria-label="Checklist">
          {SHEET_KEYS.map((k) => (
            <li key={k}>
              <Button variant="ghost" className="h-8 w-full justify-between" aria-label={`Ask about ${k}: ${statusText(k)}`} onClick={() => refine(k)}>
                <span>
                  {k}
                  {!REQUIRED.has(k) && <span className="text-muted-foreground"> (optional)</span>}
                </span>
                <span className={cn('text-caption', statusOf(now, k) === 'filled' && !draft.skipped.includes(k) ? 'text-verdigris' : 'text-muted-foreground')}>
                  {statusText(k)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <SectionLabel>Round {draft.round}</SectionLabel>
        {draft.asked.length === 0 && <p className="text-caption text-muted-foreground">Nothing left to ask. Pick a key above to refine it.</p>}
        {draft.asked.map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${k}`} className="text-control">
              {QUESTIONS[k]}
            </label>
            <div className="flex gap-2">
              <Input key={now[k]} id={`${id}-${k}`} defaultValue={now[k] ?? ''} onBlur={(ev) => answer(k, ev.target.value.trim())} />
              <Button variant="ghost" className="h-10 shrink-0" aria-label={`Skip ${k}`} onClick={() => skip(k)}>
                Skip
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3.5">
          <Button onClick={() => update(nextRound(api, e.id, draft))}>Next round</Button>
          <Button variant="primary" disabled={!isComplete(own, draft.skipped)} onClick={onClose}>
            Done
          </Button>
        </div>
      </DrawerBody>
    </Drawer>
  );
}
