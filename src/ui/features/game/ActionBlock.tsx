import { useRef, useState } from 'react';
import type { Action } from '@core/model';
import { actionText } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { OutputTools } from './OutputTools';

export const PROSE = 'm-0 whitespace-pre-wrap text-prose';

interface Props {
  action: Action;
  adventureId: string;
  isLast: boolean;
  busy: boolean;
  api: GameApi;
  onViewContext: () => void;
  onViewTrace: () => void;
  contextSummary?: string | undefined;
}

const quoted = (a: Action) => a.type === 'do' || a.type === 'say';

/** A See-mode action: the caption shows while the image is still generating. */
function SeeBlock({ adventureId, image }: { adventureId: string; image: NonNullable<Action['image']> }) {
  const blobUrl = useImageBlob(adventureId, image.imageId);
  // `url` only comes from imported AI Dungeon data; ours are blobs.
  const src = image.url ?? blobUrl;
  return (
    <figure className="m-0">
      {src !== undefined && <img src={src} alt={image.prompt} className="max-w-full rounded-lg" />}
      <figcaption className="font-sans text-caption text-muted-foreground">{image.prompt}</figcaption>
    </figure>
  );
}

/** One action; double-click edits it in place, blur commits, Escape reverts. */
export function ActionBlock({ action, adventureId, isLast, busy, api, onViewContext, onViewTrace, contextSummary }: Props) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const text = actionText(action);
  const isPlayer = quoted(action) || action.type === 'story';
  // Do/Say are stored as "> You …"; the pill already says which.
  const display = quoted(action) ? text.replace(/^>\s*/, '') : text;

  const commit = () => {
    setEditing(false);
    const next = ref.current?.innerText ?? display;
    const restored = quoted(action) ? `> ${next.trim()}` : next;
    if (restored !== text) api.edit(action.id, restored);
  };

  if (action.type === 'see' && action.image) return <SeeBlock adventureId={adventureId} image={action.image} />;

  const paragraph = (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- pointer shortcut; keyboard users have the Edit button
    <p
      ref={ref}
      className={cn(PROSE, isPlayer && 'text-foreground', editing && 'rounded-[4px] outline-1 outline-offset-4 outline-lantern outline-dashed')}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={() => !busy && setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        setEditing(false);
        if (ref.current) ref.current.innerText = display;
      }}
      title={editing ? 'Editing — click outside to save' : 'Double-click to edit'}
    >
      {display}
    </p>
  );

  return (
    <div>
      {isPlayer ? (
        <div className="flex items-start gap-3">
          <Pill tone={action.type === 'story' ? 'story' : action.type === 'say' ? 'say' : 'do'} className="mt-[5px] font-sans">
            {action.type}
          </Pill>
          {paragraph}
        </div>
      ) : (
        paragraph
      )}
      {isLast && !busy && (
        <OutputTools
          action={action}
          api={api}
          onEdit={() => setEditing(true)}
          onViewContext={onViewContext}
          onViewTrace={onViewTrace}
          contextSummary={contextSummary}
        />
      )}
    </div>
  );
}
