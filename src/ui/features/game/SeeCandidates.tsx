import { useState } from 'react';
import type { Action } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';

type Image = NonNullable<Action['image']>;

const tool = 'h-7 bg-transparent px-2.5 text-caption';

/**
 * Which render of a See the block shows. Every render is a slot; while a new one is pending or after it
 * failed, the action's own state is one more slot at the end. Starts on the shown render; a new render
 * (the slot count changes) jumps back to it.
 */
export function useCandidateView(image: Image) {
  const renders = image.candidates ?? [];
  const current = renders.findIndex((c) => c.imageId === image.imageId);
  const slots = current === -1 ? renders.length + 1 : renders.length;
  const [flip, setFlip] = useState({ at: -1, slots });
  const at = flip.slots === slots && flip.at >= 0 ? flip.at : current === -1 ? slots - 1 : current;
  const viewed = renders[at];
  const { brief: _b, entityIds: _e, seed: _s, ...base } = image;
  return {
    at,
    slots,
    /** The image with the viewed render's blob and prompt in place of the shown one's. */
    view: viewed ? { ...base, ...viewed } : image,
    viewedId: viewed?.imageId,
    go: (next: number) => setFlip({ at: (next + slots) % slots, slots }),
  };
}

/** "‹ 2 / 3 ›" and Keep this, under a See that has more than one render. */
export function SeeCandidates({
  actionId,
  generating,
  api,
  v,
}: {
  actionId: string;
  generating: boolean;
  api: GameApi;
  v: ReturnType<typeof useCandidateView>;
}) {
  const { viewedId } = v;
  return (
    <div className="mt-1.5 flex items-center gap-2 font-sans text-caption text-muted-foreground">
      <Button className={tool} aria-label="Previous render" onClick={() => v.go(v.at - 1)}>
        ‹
      </Button>
      <span aria-label="Render">
        {v.at + 1} / {v.slots}
      </span>
      <Button className={tool} aria-label="Next render" onClick={() => v.go(v.at + 1)}>
        ›
      </Button>
      <Button className={tool} disabled={generating || viewedId === undefined} onClick={() => viewedId !== undefined && api.chooseSee(actionId, viewedId)}>
        Keep this
      </Button>
    </div>
  );
}
