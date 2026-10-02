import { lazy, Suspense, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { newScenario, scenarioSummary, type AppSettings, type Scenario } from '@core/model';
import { storage } from '@app/services';
import { startScenario } from '@app/scenarios';
import { Button } from '@ui/components/ui/button';
import { Pill } from '@ui/components/ui/pill';
import { importScenarioFromFile, pickFile } from '@ui/transferUi';
import { SCENARIO_TYPES } from '../scenario/scenarioTypes';

// Its drawer primitives would otherwise join a chunk shared with the start-up path.
const PrePlayDialog = lazy(async () => ({ default: (await import('../scenario/PrePlayDialog')).PrePlayDialog }));
interface Props {
  app: AppSettings;
  onEdit: (id: string) => void;
  onPlay: (adventureId: string, warning?: string) => void;
  onError: (message: string) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
async function importFile(): Promise<void> {
  const file = await pickFile('.json,application/json');
  if (file) await storage.putScenario(await importScenarioFromFile(file));
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summaryLine(s: Scenario): string {
  const c = scenarioSummary(s);
  const parts = [SCENARIO_TYPES.find((t) => t.id === c.type)?.label ?? c.type];
  if (c.type === 'multipleChoice') return [...parts, count(c.branches, 'branch', 'branches')].join(' · ');
  if (c.placeholders > 0) parts.push(count(c.placeholders, 'placeholder'));
  parts.push(count(c.cards, 'card'));
  if (c.scripts > 0) parts.push(count(c.scripts, 'script'));
  return parts.join(' · ');
}

function ScenarioCard({ scenario: s, onEdit, onPlay, onDelete }: { scenario: Scenario; onEdit: () => void; onPlay: () => void; onDelete: () => void }) {
  const title = s.title === '' ? 'Untitled scenario' : s.title;
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3 text-foreground hover:border-neutral">
      <div className="w-16 shrink-0 rounded-md bg-secondary" />
      <div className="flex min-w-0 grow flex-col gap-1">
        <button type="button" className="truncate border-none bg-transparent p-0 text-left font-display text-card-title font-medium" onClick={onEdit}>
          {title}
        </button>
        <span className="text-caption text-muted-foreground">{summaryLine(s)}</span>
        {s.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.tags.map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </div>
        )}
        <div className="mt-1 flex gap-1.5">
          <Button className="h-7 px-2.5 text-label" aria-label={`Play ${title}`} onClick={onPlay}>
            Play
          </Button>
          <span className="grow" />
          <Button variant="ghost" danger className="h-7 px-2 text-label" aria-label={`Delete ${title}`} onClick={onDelete}>
            delete
          </Button>
        </div>
      </div>
    </div>
  );
}

/** "My scenarios": cards into the editor or straight into play, plus "+ New scenario". */
export function ScenarioGrid({ app, onEdit, onPlay, onError }: Props) {
  const scenarios = useLiveQuery(() => storage.listScenarios(), []) ?? [];
  const [playing, setPlaying] = useState<Scenario | null>(null);
  const [starting, setStarting] = useState(false);

  const create = () => {
    const s = newScenario();
    storage.putScenario(s).then(
      () => onEdit(s.id),
      (e: unknown) => onError(message(e)),
    );
  };
  const remove = (s: Scenario) => {
    if (!confirm(`Delete the scenario "${s.title || 'Untitled scenario'}"? Adventures started from it are kept.`)) return;
    storage.deleteScenario(s.id).catch((e: unknown) => onError(message(e)));
  };
  const begin = (root: Scenario, leaf: Scenario, answers: Record<string, string>, picked: string[]) => {
    setStarting(true);
    startScenario(leaf, answers, app, picked, root).then(
      ({ adventure, warning }) => onPlay(adventure.id, warning),
      (e: unknown) => {
        setStarting(false);
        onError(message(e));
      },
    );
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <h2 className="m-0 font-display text-heading font-medium">My scenarios</h2>
        <span className="text-caption text-muted-foreground">{scenarios.length}</span>
        <span className="grow" />
        <Button variant="ghost" onClick={() => void importFile().catch((e: unknown) => onError(message(e)))} title="Storyloom scenario JSON">
          Import…
        </Button>
        <Button variant="ghost" onClick={create}>
          + New scenario
        </Button>
      </div>
      {scenarios.length === 0 && (
        <p className="m-0 text-caption text-muted-foreground">Scenarios are reusable templates with placeholders, story cards and scripts.</p>
      )}
      <div className="grid grid-cols-4 gap-4 max-[1100px]:grid-cols-2 max-sm:grid-cols-1">
        {scenarios.map((s) => (
          <ScenarioCard key={s.id} scenario={s} onEdit={() => onEdit(s.id)} onPlay={() => setPlaying(s)} onDelete={() => remove(s)} />
        ))}
      </div>
      {playing && (
        <Suspense fallback={null}>
          <PrePlayDialog
            scenario={playing}
            busy={starting}
            onBegin={(leaf, answers, picked) => begin(playing, leaf, answers, picked)}
            onClose={() => setPlaying(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
