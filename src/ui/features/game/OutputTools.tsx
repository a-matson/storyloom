import type { Action } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { IconLeft, IconRight } from '@ui/components/Icons';

interface Props {
  action: Action;
  api: GameApi;
  onEdit: () => void;
  onViewContext: () => void;
  contextSummary?: string | undefined;
}

const tool = 'h-7 bg-transparent px-2.5 text-caption';
const arrow = 'inline-flex size-5 items-center justify-center border-none bg-transparent p-0 text-foreground';

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

/** Under the last output: retry stack, edit, erase, context. */
export function OutputTools({ action, api, onEdit, onViewContext, contextSummary }: Props) {
  return (
    <div className="mt-1.5 flex items-center gap-2 font-sans text-caption text-muted-foreground">
      {action.type === 'continue' && action.versions.length > 1 && <RetryStack action={action} api={api} />}
      <Button className={tool} onClick={onEdit}>
        Edit
      </Button>
      <Button className={tool} onClick={() => api.eraseTo(action.id)}>
        Erase to here
      </Button>
      <Button variant="system" className={`${tool} border-border`} onClick={onViewContext}>
        View context
      </Button>
      <span className="grow" />
      {contextSummary !== undefined && <span>{contextSummary}</span>}
    </div>
  );
}
