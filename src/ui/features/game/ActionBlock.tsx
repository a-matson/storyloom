import { useEffect, useRef, useState } from 'react';
import type { Action, AppSettings } from '@core/model';
import { actionText } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { OutputTools, actionGrid, caretAtEnd, textColumn } from './OutputTools';
import { SeeBlock } from './SeeBlock';

export const PROSE = 'm-0 whitespace-pre-wrap text-prose';

interface Props {
  action: Action;
  adventureId: string;
  isLast: boolean;
  busy: boolean;
  /** Action ids whose image is being generated right now. */
  pendingImages: readonly string[];
  api: GameApi;
  speech: AppSettings['speech'];
  onViewContext: () => void;
  onViewTrace: () => void;
  contextSummary?: string | undefined;
}

const quoted = (a: Action) => a.type === 'do' || a.type === 'say';

/** One action; double-click edits it in place, blur commits, Escape reverts. */
export function ActionBlock({ action, adventureId, isLast, busy, pendingImages, api, speech, onViewContext, onViewTrace, contextSummary }: Props) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const text = actionText(action);
  const isPlayer = quoted(action) || action.type === 'story';
  // Do/Say are stored as "> You …"; the pill already says which.
  const display = quoted(action) ? text.replace(/^>\s*/, '') : text;

  useEffect(() => {
    if (editing && ref.current) caretAtEnd(ref.current);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = ref.current?.innerText ?? display;
    const restored = quoted(action) ? `> ${next.trim()}` : next;
    if (restored !== text) api.edit(action.id, restored);
  };

  if (action.type === 'see' && action.image)
    return (
      <SeeBlock
        action={action}
        image={action.image}
        adventureId={adventureId}
        isLast={isLast}
        busy={busy}
        generating={pendingImages.includes(action.id)}
        api={api}
      />
    );

  const paragraph = (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the paragraph is the edit control; Enter opens it
    <p
      ref={ref}
      // ponytail: one tab stop per action, so a 5 000-action story is 5 000 stops; a roving tabindex or a skip link if it ever hurts.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the paragraph is the control, so it has to be reachable
      tabIndex={0}
      className={cn(PROSE, isPlayer && 'text-foreground', editing && 'rounded-[4px] outline-1 outline-offset-4 outline-lantern outline-dashed')}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={() => !busy && setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !editing) {
          if (busy) return;
          e.preventDefault();
          setEditing(true);
          return;
        }
        if (e.key !== 'Escape') return;
        setEditing(false);
        if (ref.current) ref.current.innerText = display;
      }}
      aria-keyshortcuts="Enter"
      title={editing ? 'Editing — click outside to save' : 'Double-click or press Enter to edit'}
    >
      {display}
    </p>
  );

  return (
    <div className={cn('group', actionGrid)}>
      {isPlayer && (
        <Pill tone={action.type === 'story' ? 'story' : action.type === 'say' ? 'say' : 'do'} className="mt-[5px] justify-self-start font-sans">
          {action.type}
        </Pill>
      )}
      <div className={textColumn}>
        {paragraph}
        {isLast && !busy && (
          <OutputTools
            action={action}
            api={api}
            speech={speech}
            onEdit={() => setEditing(true)}
            onViewContext={onViewContext}
            onViewTrace={onViewTrace}
            contextSummary={contextSummary}
          />
        )}
      </div>
    </div>
  );
}
