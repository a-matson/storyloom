import { newOption } from '@core/model';
import { Button } from '@ui/components/ui/button';
import type { TabProps } from './fields';

/** Multiple Choice: the player picks one of these after reading the Prompt; each is a full scenario. */
export function OptionsList({ draft, update, onOpen }: TabProps & { onOpen: (id: string) => void }) {
  const options = draft.options ?? [];
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-control font-semibold">Options</h2>
        <span className="text-caption text-muted-foreground">the Prompt is the question shown above them</span>
        <span className="grow" />
        <Button variant="primary" className="h-7" onClick={() => update({ options: [...options, newOption(draft)] })}>
          + Add option
        </Button>
      </div>
      {options.length === 0 && <p className="m-0 text-caption text-muted-foreground">No options yet.</p>}
      {options.map((o, i) => {
        const title = o.title === '' ? `Option ${i + 1}` : o.title;
        return (
          <div key={o.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
            <span className="truncate text-control font-medium">{title}</span>
            <span className="grow" />
            <Button className="h-7" onClick={() => onOpen(o.id)} aria-label={`Open ${title}`}>
              Open
            </Button>
            <Button
              variant="ghost"
              danger
              className="h-7"
              aria-label={`Remove ${title}`}
              onClick={() => {
                if (confirm(`Remove ${title} and everything under it?`)) update({ options: options.filter((x) => x.id !== o.id) });
              }}
            >
              Remove
            </Button>
          </div>
        );
      })}
    </section>
  );
}
