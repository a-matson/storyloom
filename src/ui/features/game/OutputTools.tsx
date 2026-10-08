import type { Action, AppSettings } from '@core/model';
import { actionText } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { useSpeech } from '@ui/hooks/useSpeech';
import { Button } from '@ui/components/ui/button';
import { Pill } from '@ui/components/ui/pill';
import { IconLeft, IconRight } from '@ui/components/Icons';
import { cn } from '@ui/lib/utils';

interface Props {
  action: Action;
  api: GameApi;
  speech: AppSettings['speech'];
  onEdit: () => void;
  onViewContext: () => void;
  onViewTrace: () => void;
  contextSummary?: string | undefined;
  /** The fact the contradiction check says this output breaks. */
  contradiction?: string | undefined;
}

const tool = 'h-7 bg-transparent px-2.5 text-caption';
/** Revealed on hover or keyboard focus; opacity keeps the row's space so nothing shifts. */
export const revealOnHover =
  'opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100';
/** Every action block is this grid, so the text column is identical by construction, not by matching paddings. */
export const actionGrid = 'grid max-sm:gap-y-1 sm:grid-cols-[var(--gutter)_1fr]';
/** The text cell of `actionGrid`; at max-sm the grid is one column and the label stacks above with the same left edge. */
export const textColumn = 'sm:col-start-2';
/** A block with no label of its own (See) clears the same gutter with padding. */
export const seeIndent = 'sm:ps-[var(--gutter)]';
const arrow = 'inline-flex size-5 items-center justify-center border-none bg-transparent p-0 text-foreground';

/**
 * `contentEditable` turns on a render after the key that asked for it, and an element that
 * already had focus gets no caret of its own, so typing would go nowhere. Call it when editing opens.
 */
export function caretAtEnd(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function RetryStack({ action, api }: { action: Action; api: GameApi }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1">
      <button
        type="button"
        className={arrow}
        aria-label="Previous retry"
        onClick={() => api.setVersion(action.id, action.active - 1)}
        disabled={action.active === 0}
      >
        <IconLeft />
      </button>
      <span className="font-mono text-caption">
        {action.active + 1} of {action.versions.length}
      </span>
      <button
        type="button"
        className={arrow}
        aria-label="Next retry"
        onClick={() => api.setVersion(action.id, action.active + 1)}
        disabled={action.active === action.versions.length - 1}
      >
        <IconRight />
      </button>
    </span>
  );
}

/** Under the last output: the contradiction mark (always shown), then retry stack, edit, erase, context. */
export function OutputTools({ action, api, speech, onEdit, onViewContext, onViewTrace, contextSummary, contradiction }: Props) {
  const voice = useSpeech();
  return (
    <div className="mt-1.5 flex items-center gap-2 font-sans text-caption text-muted-foreground">
      {contradiction !== undefined && (
        <output className="min-w-0">
          <Pill tone="warning" className="block max-w-[40ch] truncate normal-case tracking-normal" title={contradiction}>
            May contradict: {contradiction}
          </Pill>
        </output>
      )}
      {contradiction !== undefined && (
        <Button className={tool} onClick={() => api.retry(contradiction)}>
          Retry with note
        </Button>
      )}
      <div className={cn('flex grow items-center gap-2', revealOnHover)}>
        {action.type === 'continue' && action.versions.length > 1 && <RetryStack action={action} api={api} />}
        {voice.supported && (
          <Button className={tool} onClick={() => (voice.speaking ? voice.stop() : voice.speak(actionText(action), speech))}>
            {voice.speaking ? 'Stop' : 'Speak'}
          </Button>
        )}
        <Button className={tool} onClick={onEdit}>
          Edit
        </Button>
        <Button className={tool} onClick={() => api.eraseTo(action.id)}>
          Erase to here
        </Button>
        <Button variant="system" className={`${tool} border-border`} onClick={onViewContext}>
          View context
        </Button>
        {action.type === 'continue' && (
          <Button variant="system" className={`${tool} border-border`} onClick={onViewTrace}>
            Trace
          </Button>
        )}
        <span className="grow" />
        {contextSummary !== undefined && <span>{contextSummary}</span>}
      </div>
    </div>
  );
}
