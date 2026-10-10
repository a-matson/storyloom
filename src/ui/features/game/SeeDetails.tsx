import { useState, useSyncExternalStore } from 'react';
import type { Action } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Textarea } from '@ui/components/ui/textarea';
import { cn } from '@ui/lib/utils';
import { CHIP } from './sidebar/Section';
import { Avatar } from './entities/Avatar';
import { EntityDrawer } from './entities/EntityDrawer';

interface Props {
  id: string;
  image: NonNullable<Action['image']>;
  busy: boolean;
  api: GameApi;
}

/** Under a See image: a chip per character it shows (opens their drawer), and the prompt the brief became, editable raw. */
export function SeeDetails({ id, image, busy, api }: Props) {
  const adventure = useSyncExternalStore(api.subscribe, () => api.getSnapshot().adventure);
  const [open, setOpen] = useState<string | null>(null);
  // A deleted character's id stays on the image; it just has no chip.
  const cast = (image.entityIds ?? []).flatMap((e) => adventure.entities.find((x) => x.id === e) ?? []);
  const opened = cast.find((e) => e.id === open);
  if (cast.length === 0 && image.brief === undefined) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-sans text-caption text-muted-foreground">
      {cast.map((e) => (
        <button key={e.id} type="button" className={cn(CHIP, 'flex h-8 items-center gap-1.5 ps-0')} aria-label={`Open ${e.name}`} onClick={() => setOpen(e.id)}>
          <Avatar name={e.name} adventureId={adventure.id} portraitId={e.portraitId} />
          {e.name}
        </button>
      ))}
      {image.brief !== undefined && (
        <details className="w-full">
          <summary className="cursor-pointer">Prompt</summary>
          <form
            className="mt-1.5 flex flex-col items-start gap-1.5"
            onSubmit={(ev) => {
              ev.preventDefault();
              const prompt = new FormData(ev.currentTarget).get('prompt');
              if (typeof prompt === 'string') api.regenerateSee(id, `/raw ${prompt}`);
            }}
          >
            {/* Keyed by the prompt: a recomposed brief replaces it under this uncontrolled field. */}
            <Textarea key={image.prompt} name="prompt" aria-label="Image prompt" className="min-h-16 text-caption" defaultValue={image.prompt} />
            <Button type="submit" className="h-7 px-2.5 text-caption" disabled={busy} title="Sent as written; the caption becomes this prompt">
              Generate from this prompt
            </Button>
          </form>
        </details>
      )}
      {opened && <EntityDrawer key={opened.id} entity={opened} adventure={adventure} api={api} onClose={() => setOpen(null)} />}
    </div>
  );
}
