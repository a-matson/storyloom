import { useLiveQuery } from 'dexie-react-hooks';
import { newScenario } from '@core/model';
import { storage } from '@app/services';
import { Button } from '@ui/components/ui/button';

interface Props {
  onEdit: (id: string) => void;
  onError: (message: string) => void;
}

/** "My scenarios": a title list into the editor, plus "+ New scenario". */
export function ScenarioList({ onEdit, onError }: Props) {
  const scenarios = useLiveQuery(() => storage.listScenarios(), []) ?? [];
  const create = () => {
    const s = newScenario();
    storage.putScenario(s).then(
      () => onEdit(s.id),
      (e: unknown) => onError(e instanceof Error ? e.message : String(e)),
    );
  };
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <h2 className="m-0 font-display text-heading font-medium">My scenarios</h2>
        <span className="text-caption text-muted-foreground">{scenarios.length}</span>
        <span className="grow" />
        <Button variant="ghost" onClick={create}>
          + New scenario
        </Button>
      </div>
      {scenarios.length === 0 ? (
        <p className="m-0 text-caption text-muted-foreground">Scenarios are reusable templates with placeholders, story cards and scripts.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="border-none bg-transparent p-0 text-left font-display text-card-title text-foreground"
                onClick={() => onEdit(s.id)}
              >
                {s.title === '' ? 'Untitled scenario' : s.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
