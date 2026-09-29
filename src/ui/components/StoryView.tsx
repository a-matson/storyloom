import { useEffect, useRef, useState } from 'react';
import type { Action } from '@core/types';
import { actionText } from '@core/types';
import type { GameApi } from '../hooks/useGame';
import { IconLeft, IconRight } from './Icons';

interface Props {
  actions: Action[];
  streaming: string;
  busy: boolean;
  api: GameApi;
  onViewContext: () => void;
  contextSummary?: string;
}

/**
 * The story column. Player actions carry a mode pill; AI outputs are plain
 * prose. The last output shows the retry stack and tools. Any block can be
 * edited in place (click → contenteditable → blur commits).
 *
 * TODO(perf, milestone 1): virtualise with @tanstack/react-virtual once
 * adventures pass ~500 actions; keep the DOM small.
 */
export function StoryView({ actions, streaming, busy, api, onViewContext, contextSummary }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [actions.length, streaming]);

  const lastIdx = actions.length - 1;
  return (
    <div className="story-scroll">
      <div className="story">
        {actions.map((a, i) => (
          <ActionBlock key={a.id} action={a} isLast={i === lastIdx} busy={busy} api={api} onViewContext={onViewContext} contextSummary={contextSummary} />
        ))}
        {streaming && (
          <p aria-live="polite">
            {streaming}
            <span className="caret" />
          </p>
        )}
        {busy && !streaming && (
          <p className="muted" style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>
            thinking… <span className="caret" />
          </p>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function ActionBlock({ action, isLast, busy, api, onViewContext, contextSummary }: { action: Action; isLast: boolean; busy: boolean; api: GameApi; onViewContext: () => void; contextSummary?: string }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const text = actionText(action);
  const isPlayer = action.type === 'do' || action.type === 'say' || action.type === 'story';
  const display = action.type === 'do' || action.type === 'say' ? text.replace(/^>\s*/, '') : text;

  const commit = () => {
    setEditing(false);
    const next = ref.current?.innerText ?? display;
    const restored = action.type === 'do' || action.type === 'say' ? `> ${next.trim()}` : next;
    if (restored !== text) api.edit(action.id, restored);
  };

  const paragraph = (
    <p
      ref={ref}
      className="editable"
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={() => !busy && setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setEditing(false);
          if (ref.current) ref.current.innerText = display;
        }
      }}
      title={editing ? 'Editing — click outside to save' : 'Double-click to edit'}
    >
      {display}
    </p>
  );

  if (action.type === 'see' && action.image) {
    return (
      <figure style={{ margin: 0 }}>
        <img src={action.image.url} alt={action.image.prompt} style={{ maxWidth: '100%', borderRadius: 12 }} />
        <figcaption className="muted small" style={{ fontFamily: 'var(--font-ui)' }}>{action.image.prompt}</figcaption>
      </figure>
    );
  }

  return (
    <div className={isPlayer ? 'player' : ''}>
      {isPlayer ? (
        <div className="action">
          <span className={`pill ${action.type}`}>{action.type}</span>
          {paragraph}
        </div>
      ) : (
        paragraph
      )}
      {isLast && !busy && (
        <div className="output-tools">
          {action.type === 'continue' && action.versions.length > 1 && (
            <span className="retry-stack">
              <button aria-label="Previous retry" onClick={() => api.setVersion(action.id, action.active - 1)} disabled={action.active === 0}>
                <IconLeft />
              </button>
              <span className="mono">
                {action.active + 1} of {action.versions.length}
              </span>
              <button aria-label="Next retry" onClick={() => api.setVersion(action.id, action.active + 1)} disabled={action.active === action.versions.length - 1}>
                <IconRight />
              </button>
            </span>
          )}
          <button className="btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn" onClick={() => api.eraseTo(action.id)}>
            Erase to here
          </button>
          <button className="btn system" onClick={onViewContext} style={{ borderColor: 'var(--border)' }}>
            View context
          </button>
          <span className="grow" />
          {contextSummary && <span>{contextSummary}</span>}
        </div>
      )}
    </div>
  );
}
