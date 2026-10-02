import { useRef, useState } from 'react';
import type { Action } from '@core/model';
import { actionText } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { OutputTools } from './OutputTools';

export const PROSE = 'm-0 whitespace-pre-wrap text-prose';

interface Props {
  action: Action;
  isLast: boolean;
  busy: boolean;
  api: GameApi;
  onViewContext: () => void;
  contextSummary?: string | undefined;
}

const quoted = (a: Action) => a.type === 'do' || a.type === 'say';

/** One action; double-click edits it in place, blur commits, Escape reverts. */
export function ActionBlock({ action, isLast, busy, api, onViewContext, contextSummary }: Props) {
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

  if (action.type === 'see' && action.image) {
    return (
      <figure className="m-0">
        <img src={action.image.url} alt={action.image.prompt} className="max-w-full rounded-lg" />
        <figcaption className="font-sans text-caption text-muted-foreground">{action.image.prompt}</figcaption>
      </figure>
    );
  }

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
        <OutputTools action={action} api={api} onEdit={() => setEditing(true)} onViewContext={onViewContext} contextSummary={contextSummary} />
      )}
    </div>
  );
}
