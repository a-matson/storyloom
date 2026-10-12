import type { Adventure, Entity } from '@core/model';
import type { entityEdits } from '@app/session/entities';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { cn } from '@ui/lib/utils';
import { Button } from '@ui/components/ui/button';
import { SectionLabel } from '@ui/components/ui/section-label';

export type Update = (patch: Partial<Entity>) => void;

/** Bring an action into view; the story column's children are the actions in order. */
export const showAction = (index: number) => document.getElementById('story')?.children[index]?.scrollIntoView({ block: 'center' });

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
