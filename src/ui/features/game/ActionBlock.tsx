import { useEffect, useRef, useState } from 'react';
import type { Action, AppSettings, Entity } from '@core/model';
import { actionText } from '@core/model';
import { paragraphs } from '@core/text';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { Avatar } from './entities/Avatar';
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
  /** The adventure's entities when speaker portraits are on. */
  cast?: readonly Entity[] | undefined;
}

const quoted = (a: Action) => a.type === 'do' || a.type === 'say';

interface ProseProps {
  text: string;
  speakers: Action['speakers'];
  cast: readonly Entity[] | undefined;
  adventureId: string;
}

/** The action text; with speaker labels, one block per paragraph and the speaker's portrait in the gutter (above it on phones). */
function Prose({ text, speakers, cast, adventureId }: ProseProps) {
  if (!cast || (speakers?.length ?? 0) === 0) return text;
  return paragraphs(text).map((p, i) => {
    const name = speakers?.find((s) => s.paragraph === i)?.name;
    // Nothing for a name no entity has (deleted since): never a wrong face.
    const e = name === undefined ? undefined : cast.find((c) => c.name === name || c.aliases.includes(name));
    return (
      // oxlint-disable-next-line react/no-array-index-key -- `Action.speakers` addresses paragraphs by index
      <span key={i} className="relative block not-first:mt-[1lh]">
        {e && (
          <span className="block w-fit max-sm:mb-1 sm:absolute sm:top-0 sm:-inset-s-(--gutter)">
            <span className="sr-only">{e.name} says</span>
            <Avatar name={e.name} adventureId={adventureId} portraitId={e.portraitId} />
          </span>
        )}
        {p}
      </span>
    );
  });
}

/** One action; double-click edits it in place, blur commits, Escape reverts. */
export function ActionBlock(props: Props) {
  const { action, adventureId, isLast, busy, pendingImages, api } = props;
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
  return <TextBlock {...props} />;
}

function TextBlock({ action, adventureId, isLast, busy, api, speech, onViewContext, onViewTrace, contextSummary, cast }: Props) {
  const [editing, setEditing] = useState(false);
  // Bumped when an edit ends: the paragraph remounts, so React never reconciles DOM the player rewrote.
  const [rev, setRev] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);
  const text = actionText(action);
  const isPlayer = quoted(action) || action.type === 'story';
  // Do/Say are stored as "> You …"; the pill already says which.
  const display = quoted(action) ? text.replace(/^>\s*/, '') : text;

  useEffect(() => {
    if (editing && ref.current) caretAtEnd(ref.current);
  }, [editing]);

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    setRev((r) => r + 1);
    const next = ref.current?.innerText ?? display;
    const restored = quoted(action) ? `> ${next.trim()}` : next;
    if (restored !== text) api.edit(action.id, restored);
  };

  const paragraph = (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the paragraph is the edit control; Enter opens it
    <p
      key={rev}
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
        if (e.key !== 'Escape' || !editing) return;
        if (ref.current) ref.current.innerText = display;
        setEditing(false);
        setRev((r) => r + 1);
        requestAnimationFrame(() => ref.current?.focus()); // the remounted paragraph
      }}
      aria-keyshortcuts="Enter"
      title={editing ? 'Editing — click outside to save' : 'Double-click or press Enter to edit'}
    >
      {editing ? display : <Prose text={display} speakers={action.speakers} cast={cast} adventureId={adventureId} />}
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
