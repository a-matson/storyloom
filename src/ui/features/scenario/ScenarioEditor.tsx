import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { creatorChoices, placeholderQuestions, type AppSettings, type Scenario } from '@core/model';
import { storage } from '@app/services';
import { startScenario } from '@app/scenarios';
import { Button } from '@ui/components/ui/button';
import { Segmented } from '@ui/components/ui/drawer';
import { Select } from '@ui/components/ui/field';
import { Toast } from '@ui/components/ui/toast';
import { TopBar, TopBarTitle } from '@ui/components/ui/top-bar';
import { IconHome } from '@ui/components/Icons';
import { useScenarioDraft } from './useScenarioDraft';
import { BasicsTab } from './BasicsTab';
import { TechnicalTab } from './TechnicalTab';
import { ScriptsTab } from './ScriptsTab';
import { ScenarioRail } from './ScenarioRail';
import { PrePlayDialog } from './PrePlayDialog';

const TABS = [
  { id: 'basics', label: 'Basics' },
  { id: 'technical', label: 'Technical' },
  { id: 'scripts', label: 'Scripts' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const TYPES: { id: Scenario['type']; label: string }[] = [
  { id: 'story', label: 'Story' },
  { id: 'characterCreator', label: 'Character creator' },
  { id: 'multipleChoice', label: 'Multiple choice' },
];

interface Props {
  id: string;
  app: AppSettings;
  onExit: () => void;
  /** `warning`: the adventure started, but something (the AI opening) fell back. */
  onPlay: (adventureId: string, warning?: string) => void;
}

/** Loads the scenario, then hands it to the editor; `key` resets the draft when the id changes. */
export function ScenarioEditor({ id, app, onExit, onPlay }: Props) {
  const saved = useLiveQuery(async () => (await storage.getScenario(id)) ?? null, [id]);
  if (saved === undefined) return <div className="h-full" />;
  if (saved === null)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Scenario not found.</p>
        <Button onClick={onExit}>Back to library</Button>
      </div>
    );
  return <Editor key={id} saved={saved} app={app} onExit={onExit} onPlay={onPlay} />;
}

function Editor({ saved, app, onExit, onPlay }: Omit<Props, 'id'> & { saved: Scenario }) {
  const [error, setError] = useState<string | null>(null);
  const { draft, dirty, update, save } = useScenarioDraft(saved, setError);
  const [tab, setTab] = useState<Tab>('technical');
  const typeLabel = TYPES.find((t) => t.id === draft.type)?.label ?? draft.type;
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);
  const begin = (answers: Record<string, string>, picked: string[] = []) => {
    setStarting(true);
    startScenario(draft, answers, app, picked).then(
      ({ adventure, warning }) => onPlay(adventure.id, warning),
      (e: unknown) => {
        setStarting(false);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  // Saves first so the adventure's `scenarioId` points at what was played.
  const playTest = async () => {
    if (!(await save())) return;
    if (placeholderQuestions(draft).length > 0 || creatorChoices(draft).length > 0) setAsking(true);
    else begin({});
  };
  const exit = () => {
    if (!dirty || confirm('Discard unsaved changes?')) onExit();
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar className="h-15">
        <Button size="icon" aria-label="Back to library" onClick={exit}>
          <IconHome />
        </Button>
        <div className="flex min-w-0 flex-col gap-px">
          <TopBarTitle className="truncate">{draft.title === '' ? 'Untitled scenario' : draft.title}</TopBarTitle>
          <div className="text-caption text-muted-foreground">
            Scenario · {typeLabel} · {dirty ? 'unsaved changes' : 'saved'}
          </div>
        </div>
        <Segmented value={tab} options={[...TABS]} onChange={setTab} />
        <span className="grow" />
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          Type
          <Select className="h-9 w-auto" value={draft.type} onChange={(e) => update({ type: TYPES.find((t) => t.id === e.target.value)?.id ?? 'story' })}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <Button onClick={() => void playTest()} disabled={starting}>
          Play test
        </Button>
        <Button variant="primary" onClick={() => void save()} title="Ctrl/⌘+S">
          Save
        </Button>
      </TopBar>
      <div className="flex min-h-0 grow max-lg:flex-col max-lg:overflow-y-auto">
        <main className="flex grow flex-col gap-4.5 overflow-y-auto px-7 py-6 max-lg:overflow-visible max-sm:p-4">
          {tab === 'basics' && <BasicsTab draft={draft} update={update} />}
          {tab === 'technical' && <TechnicalTab draft={draft} update={update} />}
          {tab === 'scripts' && <ScriptsTab draft={draft} update={update} />}
        </main>
        {tab !== 'scripts' && <ScenarioRail draft={draft} update={update} app={app} />}
      </div>
      {asking && <PrePlayDialog scenario={draft} busy={starting} onBegin={begin} onClose={() => setAsking(false)} />}
      {error !== null && <Toast message={error} error onDismiss={() => setError(null)} />}
    </div>
  );
}
