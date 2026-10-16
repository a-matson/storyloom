import { useEffect, useRef, useState } from 'react';
import type { Action, AppSettings, Entity } from '@core/model';
import { actionText } from '@core/model';
import { paragraphs } from '@core/text';
import type { OutputFlag } from '@core/trace';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { Avatar } from './entities/Avatar';
import { faceFor } from './entities/faceFor';
import { MarkSecret } from './MarkSecret';
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
  /** For the last output: why it is offered a retry with a note. */
  flag?: OutputFlag | undefined;
  /** The adventure's entities when speaker portraits are on. */
  cast?: readonly Entity[] | undefined;
  /** The scene's present characters, set only when this action replies to a `say`. */
  present?: readonly string[] | undefined;
  onOpenEntity: (id: string) => void;
}

const quoted = (a: Action) => a.type === 'do' || a.type === 'say';

type ProseProps = Pick<Props, 'action' | 'cast' | 'present' | 'adventureId' | 'onOpenEntity'> & { text: string };

/** The action text; when a paragraph has a face, one block per paragraph and the face in the gutter (above it on phones). Player text never has one. */
function Prose({ text, action, cast, present, adventureId, onOpenEntity }: ProseProps) {
  if (!cast || quoted(action) || action.type === 'story') return text;
  const ps = paragraphs(text);
  const labels = ps.map((_, i) => action.speakers?.find((s) => s.paragraph === i)?.name);
  const faces = ps.map((p, i) => faceFor(p, labels[i], cast, action.type === 'continue' ? present : undefined));
  if (faces.every((f) => f === undefined)) return text;
  return ps.map((p, i) => {
    const e = faces[i];
    return (
      // oxlint-disable-next-line react/no-array-index-key -- `Action.speakers` addresses paragraphs by index
      <span key={i} className="relative block not-first:mt-[1lh]">
        {e && (
          <span className="block w-fit max-sm:mb-1 sm:absolute sm:top-0 sm:-inset-s-(--gutter)">
            {/* Only a labelled paragraph is speech; a named one already says the name. */}
            {labels[i] !== undefined && <span className="sr-only">{e.name} says</span>}
            <button
              type="button"
              aria-label={`Open ${e.name}`}
              className="flex cursor-pointer rounded-full border-0 bg-transparent p-0"
              onClick={() => onOpenEntity(e.id)}
            >
              <Avatar name={e.name} adventureId={adventureId} portraitId={e.portraitId} />
            </button>
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

/** The player's pill. A Do/Say's is its menu (Mark secret): a button styled away, so the row looks and measures the same. */
function Label({ action, busy, marking, onToggle }: { action: Action; busy: boolean; marking: boolean; onToggle: () => void }) {
  if (action.type === 'story')
    return (
      <Pill tone="story" className="mt-[5px] justify-self-start font-sans">
        story
      </Pill>
    );
  if (!quoted(action)) return null;
  return (
    <button
      type="button"
      className="mt-[5px] flex cursor-pointer justify-self-start rounded-full border-0 bg-transparent p-0"
      aria-label="Mark secret"
      aria-expanded={marking}
      title="Mark secret"
      disabled={busy}
      onClick={onToggle}
    >
      <Pill tone={action.type === 'say' ? 'say' : 'do'} className="font-sans">
        {action.type}
      </Pill>
    </button>
  );
}

function TextBlock(props: Props) {
  const { action, isLast, busy, api, speech, onViewContext, onViewTrace, contextSummary, flag } = props;
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState(false);
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
      {editing ? display : <Prose {...props} text={display} />}
    </p>
  );

  return (
    // The id lets `SelectionBar` tell which action a selection is in.
    <div className={cn('group', actionGrid)} data-action-id={action.id}>
      <Label action={action} busy={busy} marking={marking} onToggle={() => setMarking(!marking)} />
      <div className={textColumn}>
        {paragraph}
        {marking && <MarkSecret action={action} display={display} api={api} busy={busy} onClose={() => setMarking(false)} />}
        {isLast && !busy && (
          <OutputTools
            action={action}
            api={api}
            speech={speech}
            onEdit={() => setEditing(true)}
            onViewContext={onViewContext}
            onViewTrace={onViewTrace}
            contextSummary={contextSummary}
            flag={flag}
          />
        )}
      </div>
    </div>
  );
}
