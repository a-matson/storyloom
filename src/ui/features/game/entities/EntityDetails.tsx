import { useId } from 'react';
import { currentStates, isCurrentState, setState } from '@core/memory';
import type { Adventure, Entity, EntityFact } from '@core/model';
import type { entityEdits } from '@app/session/entities';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { cn } from '@ui/lib/utils';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { SectionLabel } from '@ui/components/ui/section-label';

export type Update = (patch: Partial<Entity>) => void;

/** Bring an action into view; the story column's children are the actions in order. */
const showAction = (index: number) => document.getElementById('story')?.children[index]?.scrollIntoView({ block: 'center' });

/** State values, each editable and lockable: a locked value is canon, and the memory cycle only flags a disagreement. */
export function StateRows({ entity: e, update }: { entity: Entity; update: Update }) {
  const id = useId();
  const entries = Object.entries(currentStates(e));
  if (entries.length === 0) return null;
  const locked = new Set(e.canonKeys);
  const set = (k: string, value: string) => update(setState(e, k, value));
  // Locking moves the value into the map, so the lock and the value live in one place.
  const lock = (k: string, v: string) =>
    update(locked.has(k) ? { canonKeys: [...locked].filter((x) => x !== k) } : { ...setState(e, k, v), canonKeys: [...locked, k] });
  return (
    <>
      <SectionLabel>State</SectionLabel>
      {entries.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-2 text-control">
          <label htmlFor={`${id}-${i}`} className="w-28 shrink-0 truncate text-muted-foreground">
            {k}
          </label>
          {/* Keyed by value: "Accept the story" changes it under an uncontrolled input. */}
          <Input key={v} id={`${id}-${i}`} className="h-8" defaultValue={v} onBlur={(ev) => ev.target.value.trim() !== v && set(k, ev.target.value.trim())} />
          <Button variant="ghost" className="h-7 shrink-0" aria-pressed={locked.has(k)} aria-label={`Lock ${k} as canon`} onClick={() => lock(k, v)}>
            {locked.has(k) ? 'Canon' : 'Lock'}
          </Button>
        </div>
      ))}
    </>
  );
}

type Edits = Pick<ReturnType<typeof entityEdits>, 'setReference' | 'clearReference' | 'unfreeze' | 'portraitFromReference'>;

/**
 * Thumbnails of the See images tagged with this character, newest first; a click shows the image in
 * the story. A reference freezes the look the next Sees repeat; as a portrait it is centre-cropped.
 */
export function Appearances({ entity: e, adventure, onClose, edits }: { entity: Entity; adventure: Adventure; onClose: () => void; edits: Edits }) {
  const shots = adventure.actions.flatMap((a, i) => (a.image?.entityIds?.includes(e.id) ? [{ index: i, image: a.image }] : [])).toReversed();
  if (shots.length === 0) return null;
  return (
    <>
      <SectionLabel>Appearances</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {shots.map(({ index, image }) => {
          const isRef = image.imageId !== undefined && image.imageId === e.referenceImageId;
          return (
            <div key={index} className="flex w-16 flex-col gap-1">
              <button
                type="button"
                className={cn('size-16 overflow-hidden rounded-md border bg-secondary', isRef ? 'border-primary ring-2 ring-primary' : 'border-border')}
                aria-label={`Show image ${index}: ${image.brief ?? image.prompt}`}
                onClick={() => {
                  onClose();
                  showAction(index);
                }}
              >
                <Thumb adventureId={adventure.id} imageId={image.imageId} />
              </button>
              {image.imageId !== undefined && (
                <>
                  <Button
                    variant="ghost"
                    className="h-6 px-1 text-caption"
                    onClick={() => void (isRef ? edits.clearReference(e.id) : edits.setReference(e.id, image.imageId ?? ''))}
                  >
                    {isRef ? 'Clear reference' : 'Use as reference'}
                  </Button>
                  <Button variant="ghost" className="h-6 px-1 text-caption" onClick={() => void edits.portraitFromReference(e.id, image.imageId ?? '')}>
                    Use as portrait
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {e.look !== undefined && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <span className="min-w-0 grow">Frozen look: {e.look}</span>
          <Button variant="ghost" className="h-7" onClick={() => edits.unfreeze(e.id)}>
            Unfreeze
          </Button>
        </p>
      )}
    </>
  );
}

function Thumb({ adventureId, imageId }: { adventureId: string; imageId: string | undefined }) {
  const url = useImageBlob(adventureId, imageId);
  return url === undefined ? null : <img src={url} alt="" className="size-full object-cover" />;
}

export function Facts({ entity: e, update, onClose }: { entity: Entity; update: Update; onClose: () => void }) {
  const pin = (factId: string) => update({ facts: e.facts.map((f) => (f.id === factId ? { ...f, pinned: !f.pinned } : f)) });
  const without = (f: EntityFact) => e.facts.filter((x) => x.id !== f.id);
  // The player is the author: taking the story's side writes its value and unlocks the key.
  const accept = (f: EntityFact, { key, value }: { key: string; value: string }) =>
    update({ ...setState({ ...e, facts: without(f) }, key, value), canonKeys: (e.canonKeys ?? []).filter((k) => k !== key) });
  // Current state values are the State rows.
  const shown = e.facts.filter((f) => !isCurrentState(f));
  return (
    <>
      <SectionLabel>Facts</SectionLabel>
      {shown.length === 0 && <p className="m-0 text-caption text-muted-foreground">None yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {shown.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 text-control">
            <Button
              variant="ghost"
              className="h-7 shrink-0 font-mono text-caption"
              aria-label={`Show action ${f.fromAction} in the story`}
              onClick={() => {
                onClose();
                showAction(f.fromAction);
              }}
            >
              action {f.fromAction}
            </Button>
            {f.conflict && <Pill tone="see">conflict</Pill>}
            {f.until !== undefined && <Pill>until {f.until}</Pill>}
            <span className="min-w-0 grow">{f.text}</span>
            {f.claim ? (
              <span className="flex gap-1">
                <Button className="h-7" onClick={() => update({ facts: without(f) })}>
                  Keep canon
                </Button>
                <Button className="h-7" onClick={() => f.claim && accept(f, f.claim)}>
                  Accept the story
                </Button>
              </span>
            ) : (
              <Button variant="ghost" className="h-7 shrink-0" aria-pressed={!!f.pinned} aria-label={`Pin: ${f.text}`} onClick={() => pin(f.id)}>
                {f.pinned ? 'Pinned' : 'Pin'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
