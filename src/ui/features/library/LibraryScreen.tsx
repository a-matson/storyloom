import { lazy, Suspense, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppSettings } from '@core/model';
import { createBlankAdventure } from '@core/model';
import { storage } from '@app/services';
import { importAdventureFromFile, pickFile } from '@ui/transferUi';
import { Button } from '@ui/components/ui/button';
import { Toast } from '@ui/components/ui/toast';
import { LibraryHeader } from './LibraryHeader';
import { ContinueHero } from './ContinueHero';
import { QuickStart } from './QuickStart';
import { AdventureGrid } from './AdventureGrid';

// Below the fold and over the start-up budget when eager.
const ScenarioGrid = lazy(async () => ({ default: (await import('./ScenarioGrid')).ScenarioGrid }));

interface Props {
  app: AppSettings;
  backendLabel: string;
  backendOk: boolean | null;
  notice?: string | null;
  onDismissNotice?: () => void;
  /** `warning`: the adventure started with a fallback (see `startScenario`). */
  onOpen: (id: string, warning?: string) => void;
  onEditScenario: (id: string) => void;
  onSettings: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Outside the component: the React Compiler cannot lower `import()` expressions.
async function surpriseAdventure(app: AppSettings) {
  return (await import('@app/scenarios')).surpriseAdventure(app);
}

async function remove(id: string): Promise<void> {
  if (!confirm('Delete this adventure? This cannot be undone.')) return;
  await storage.deleteAdventure(id);
}

/** Home: continue the last adventure, quick starts, the adventure grid, import. */
export function LibraryScreen({ app, backendLabel, backendOk, notice, onDismissNotice, onOpen, onEditScenario, onSettings }: Props) {
  // Live: re-runs when any tab writes the tables it read (storage is Dexie).
  const adventures = useLiveQuery(() => storage.listAdventures(), []) ?? [];
  const [error, setError] = useState<string | null>(null);

  const start = (title: string, opening: string) => {
    const adv = createBlankAdventure(title, opening, app.defaults);
    storage.putAdventure(adv).then(
      () => onOpen(adv.id),
      (e: unknown) => setError(message(e)),
    );
  };

  const surprise = async () => {
    try {
      onOpen((await surpriseAdventure(app)).id);
    } catch (e) {
      setError(message(e));
    }
  };

  const importFile = async () => {
    const file = await pickFile('.json,.zip,application/json,application/zip');
    if (!file) return;
    try {
      const { adventure, warnings } = await importAdventureFromFile(file, app.defaults);
      await storage.putAdventure(adventure);
      if (warnings.length > 0) setError(`Imported with ${warnings.length} skipped item(s): ${warnings.slice(0, 3).join(' ')}`);
    } catch (e) {
      setError(message(e));
    }
  };

  const shown = error ?? notice ?? null;
  return (
    <div className="flex h-full flex-col">
      <LibraryHeader backendLabel={backendLabel} backendOk={backendOk} onSettings={onSettings} />
      <div className="flex grow flex-col gap-7 overflow-y-auto px-8 py-7 max-sm:p-4">
        <div className="flex items-stretch gap-5 max-sm:flex-col">
          <ContinueHero latest={adventures[0]} backendOk={backendOk} onOpen={onOpen} />
          <QuickStart onStart={start} onSurprise={backendOk === false ? undefined : surprise} />
        </div>
        <section className="flex flex-col gap-3.5">
          <div className="flex items-baseline gap-3">
            <h2 className="m-0 font-display text-heading font-medium">My adventures</h2>
            <span className="text-caption text-muted-foreground">{adventures.length}</span>
            <span className="grow" />
            <Button variant="ghost" onClick={() => void importFile()} title="Storyloom JSON, or an AI Dungeon adventure export (JSON or zip)">
              Import…
            </Button>
          </div>
          <AdventureGrid adventures={adventures} onOpen={onOpen} onDelete={(id) => void remove(id).catch((e: unknown) => setError(message(e)))} />
        </section>
        <Suspense fallback={null}>
          <ScenarioGrid app={app} onEdit={onEditScenario} onPlay={onOpen} onError={setError} />
        </Suspense>
      </div>
      {shown !== null && (
        <Toast
          message={shown}
          error={error !== null}
          onDismiss={() => {
            setError(null);
            onDismissNotice?.();
          }}
        />
      )}
    </div>
  );
}
