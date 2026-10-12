import { useState, type ReactNode } from 'react';
import { basisOf, holds } from '@core/memory';
import { actionText, type Adventure, type EntityFact } from '@core/model';
import { cn } from '@ui/lib/utils';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';

const LABEL = { stated: 'stated', inferred: 'inferred', player: 'yours' } as const;

/** The action a fact came from: its `sourceId`, else the action it was learned at. */
const sourceIndex = (f: EntityFact, adventure: Adventure) => {
  const i = f.sourceId === undefined ? -1 : adventure.actions.findIndex((a) => a.id === f.sourceId);
  return i >= 0 ? i : f.fromAction;
};

/** The story no longer says it: the source action is gone or lost the words. The next idle run drops it. */
function stale(f: EntityFact, adventure: Adventure): boolean {
  if (f.sourceId === undefined) return false;
  const a = adventure.actions.find((x) => x.id === f.sourceId);
  return !a || (f.evidence !== undefined && !holds(a, f.evidence));
}

interface LineProps {
  text: string;
  /** Absent for values the player set outside a fact (the state map, legacy relations): they are "yours". */
  fact?: EntityFact | undefined;
  adventure: Adventure;
  onShow: (index: number) => void;
  onEdit?: ((text: string) => void) | undefined;
  onDelete: () => void;
  onPin?: (() => void) | undefined;
  children?: ReactNode;
}

/** One card line: basis pill (stated and inferred open the evidence), text, then Pin · Edit · Delete. */
export function Line({ text, fact: f, adventure, onShow, onEdit, onDelete, onPin, children }: LineProps) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const basis = f ? basisOf(f) : 'player';
  const commit = (v: string) => {
    setEditing(false);
    if (v.trim() && v.trim() !== text) onEdit?.(v.trim());
  };
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-control">
        {f && basis !== 'player' ? (
          <button
            type="button"
            className="cursor-pointer rounded-full border-0 bg-transparent p-0"
            aria-expanded={open}
            aria-label={`Evidence: ${text}`}
            onClick={() => setOpen(!open)}
          >
            <Pill className={cn(stale(f, adventure) && 'line-through')}>{LABEL[basis]}</Pill>
          </button>
        ) : (
          <Pill>{LABEL[basis]}</Pill>
        )}
        {editing ? (
          <Input
            ref={(el) => el?.focus()}
            className="h-8 min-w-0 grow basis-40"
            aria-label={`Edit: ${text}`}
            defaultValue={text}
            onBlur={(ev) => commit(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') ev.currentTarget.blur();
              if (ev.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span className="min-w-0 grow basis-40">{text}</span>
        )}
        {/* One group, so a narrow card wraps the buttons together under the text. */}
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {children}
          {onPin && f && (
            <Button variant="ghost" className="h-7 shrink-0" aria-pressed={!!f.pinned} aria-label={`Pin: ${text}`} onClick={onPin}>
              {f.pinned ? 'Pinned' : 'Pin'}
            </Button>
          )}
          {onEdit && !editing && (
            <Button variant="ghost" className="h-7 shrink-0" aria-label={`Edit ${text}`} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button variant="ghost" className="h-7 shrink-0" aria-label={`Delete: ${text}`} onClick={onDelete}>
            Delete
          </Button>
        </span>
      </div>
      {open && f && <Evidence fact={f} adventure={adventure} onShow={onShow} />}
    </li>
  );
}

/** The source paragraph with the evidence words marked, and a jump to it. */
function Evidence({ fact: f, adventure, onShow }: { fact: EntityFact; adventure: Adventure; onShow: (index: number) => void }) {
  const index = sourceIndex(f, adventure);
  const action = adventure.actions[index];
  const text = action ? actionText(action) : '';
  const at = f.evidence ? text.toLowerCase().indexOf(f.evidence.toLowerCase()) : -1;
  const end = at + (f.evidence?.length ?? 0);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-secondary p-2 text-caption">
      <p className="m-0 font-prose">
        {at < 0 ? (
          text
        ) : (
          <>
            {text.slice(0, at)}
            <mark>{text.slice(at, end)}</mark>
            {text.slice(end)}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground">action {index}</span>
        <Button variant="ghost" className="h-7" onClick={() => onShow(index)}>
          Go to passage
        </Button>
      </div>
    </div>
  );
}
