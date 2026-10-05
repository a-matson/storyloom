import { useEffect, useRef } from 'react';
import type { Action, AppSettings } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { ActionBlock, PROSE } from './ActionBlock';
import { Caret } from './Caret';

interface Props {
  actions: Action[];
  adventureId: string;
  streaming: string;
  busy: boolean;
  pendingImages: readonly string[];
  api: GameApi;
  speech: AppSettings['speech'];
  onViewContext: () => void;
  onViewTrace: () => void;
  contextSummary?: string | undefined;
}

/** The story column: player actions carry a mode pill, AI outputs are plain prose, the last output gets the tools. */
export function StoryView({ actions, adventureId, streaming, busy, pendingImages, api, speech, onViewContext, onViewTrace, contextSummary }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  // Follow the newest text: the compiler re-renders this view only when the story, stream or turn state changes.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  });

  const lastIdx = actions.length - 1;
  return (
    <div className="flex grow justify-center overflow-y-auto px-10 pt-8 pb-6 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0">
      <div className="flex w-full max-w-story flex-col gap-[22px] font-prose text-(length:--prose-size) leading-(--prose-leading)">
        {actions.map((a, i) => (
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
          />
        ))}
        {streaming !== '' && (
          <p aria-live="polite" className={PROSE}>
            {streaming}
            <Caret />
          </p>
        )}
        {busy && streaming === '' && (
          <p className={`${PROSE} font-sans text-control`}>
            thinking… <Caret />
          </p>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
