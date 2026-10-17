import { useEffect, useRef } from 'react';
import type { Action, AppSettings, Entity, GateReason } from '@core/model';
import type { OutputFlag } from '@core/trace';
import type { GameApi } from '@ui/hooks/useGameSession';
import { ActionBlock, PROSE } from './ActionBlock';
import { cn } from '@ui/lib/utils';
import { Caret } from './Caret';
import { actionGrid, textColumn } from './OutputTools';

interface Props {
  actions: Action[];
  adventureId: string;
  streaming: string;
  busy: boolean;
  /** A retry of the last output is running: its text gives way to the new one. */
  retrying: boolean;
  pendingImages: readonly string[];
  api: GameApi;
  speech: AppSettings['speech'];
  onViewContext: () => void;
  onViewTrace: () => void;
  contextSummary?: string | undefined;
  flag?: OutputFlag | undefined;
  rerolled?: GateReason | undefined;
  cast?: readonly Entity[] | undefined;
  /** The scene's present characters: the face of a reply to a `say` that names nobody. */
  present?: readonly string[] | undefined;
  /** A gutter face was clicked. */
  onOpenEntity: (id: string) => void;
}

/** The story column: player actions carry a mode pill, AI outputs are plain prose, the last output gets the tools. */
export function StoryView({
  actions,
  adventureId,
  streaming,
  busy,
  retrying,
  pendingImages,
  api,
  speech,
  onViewContext,
  onViewTrace,
  contextSummary,
  flag,
  rerolled,
  cast,
  present,
  onOpenEntity,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  // Follow the newest text: the compiler re-renders this view only when the story, stream or turn state changes.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  });

  const lastIdx = actions.length - 1;
  const shown = retrying ? actions.slice(0, lastIdx) : actions;
  return (
    <div className="flex grow justify-center overflow-y-auto px-10 pt-8 pb-6 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0">
      {/* The id lets the entity drawer scroll to an action: this column's children are the actions in order. */}
      <div id="story" className="flex w-full max-w-story flex-col gap-[22px] font-prose text-(length:--prose-size) leading-(--prose-leading)">
        {shown.map((a, i) => (
          <ActionBlock
            key={a.id}
            action={a}
            adventureId={adventureId}
            isLast={i === lastIdx}
            busy={busy}
            pendingImages={pendingImages}
            api={api}
            speech={speech}
            onViewContext={onViewContext}
            onViewTrace={onViewTrace}
            contextSummary={contextSummary}
            flag={i === lastIdx ? flag : undefined}
            rerolled={i === lastIdx ? rerolled : undefined}
            cast={cast}
            present={actions[i - 1]?.type === 'say' ? present : undefined}
            onOpenEntity={onOpenEntity}
          />
        ))}
        {/* In the action grid, so the stream starts at the same left edge as the finished prose. */}
        {streaming !== '' && (
          <div className={actionGrid}>
            <p aria-live="polite" className={cn(PROSE, textColumn)}>
              {streaming}
              <Caret />
            </p>
          </div>
        )}
        {busy && streaming === '' && (
          <div className={actionGrid}>
            <p className={cn(PROSE, textColumn, 'font-sans text-control')}>
              thinking… <Caret />
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
