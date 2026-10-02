import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { childAt, creatorChoices, placeholderQuestions, withChild, type AppSettings, type Scenario } from '@core/model';
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
import { OptionsList } from './OptionsList';

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
  /** Multiple Choice option ids from the root; [] edits the root. */
  path: string[];
  app: AppSettings;
  onExit: () => void;
  onPath: (path: string[]) => void;
  /** `warning`: the adventure started, but something (the AI opening) fell back. */
  onPlay: (adventureId: string, warning?: string) => void;
}

/** Loads the scenario, then hands it to the editor; `key` resets the draft when the id changes. */
export function ScenarioEditor({ id, path, app, onExit, onPath, onPlay }: Props) {
  const saved = useLiveQuery(async () => (await storage.getScenario(id)) ?? null, [id]);
  if (saved === undefined) return <div className="h-full" />;
  if (saved === null)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Scenario not found.</p>
        <Button onClick={onExit}>Back to library</Button>
      </div>
    );
  return <Editor key={id} saved={saved} path={path} app={app} onExit={onExit} onPath={onPath} onPlay={onPlay} />;
}

function Editor({ saved, path, app, onExit, onPath, onPlay }: Omit<Props, 'id'> & { saved: Scenario }) {
  const [error, setError] = useState<string | null>(null);
  const { draft, dirty, update, save } = useScenarioDraft(saved, setError);
  // A Multiple Choice option is edited in place inside the root, which is what gets saved.
  const found = childAt(draft, path);
  const at = found ? path : [];
  const node = found ?? draft;
  const updateNode = (patch: Partial<Scenario>) => update(withChild(draft, at, { ...node, ...patch }));
  const [tab, setTab] = useState<Tab>('technical');
  const typeLabel = TYPES.find((t) => t.id === node.type)?.label ?? node.type;
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);
  const begin = (leaf: Scenario, answers: Record<string, string>, picked: string[]) => {
    setStarting(true);
    startScenario(leaf, answers, app, picked, draft).then(
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
    if (draft.type === 'multipleChoice' || placeholderQuestions(draft).length > 0 || creatorChoices(draft).length > 0) setAsking(true);
    else begin(draft, {}, []);
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
        {at.length > 0 && <Button onClick={() => onPath(at.slice(0, -1))}>← Parent</Button>}
        <div className="flex min-w-0 flex-col gap-px">
          <TopBarTitle className="truncate">{node.title === '' ? (at.length > 0 ? 'Untitled option' : 'Untitled scenario') : node.title}</TopBarTitle>
          <div className="text-caption text-muted-foreground">
            {at.length > 0 ? `Option of ${draft.title === '' ? 'Untitled scenario' : draft.title}` : 'Scenario'} · {typeLabel} ·{' '}
            {dirty ? 'unsaved changes' : 'saved'}
          </div>
        </div>
        <Segmented value={tab} options={[...TABS]} onChange={setTab} />
        <span className="grow" />
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          Type
          <Select className="h-9 w-auto" value={node.type} onChange={(e) => updateNode({ type: TYPES.find((t) => t.id === e.target.value)?.id ?? 'story' })}>
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
          {/* Keyed by node: these tabs keep local text state. */}
          {tab === 'basics' && <BasicsTab key={node.id} draft={node} update={updateNode} />}
          {tab === 'basics' && node.type === 'multipleChoice' && <OptionsList draft={node} update={updateNode} onOpen={(id) => onPath([...at, id])} />}
          {tab === 'technical' && <TechnicalTab key={node.id} draft={node} update={updateNode} />}
          {tab === 'scripts' && <ScriptsTab key={node.id} draft={node} update={updateNode} />}
        </main>
        {tab !== 'scripts' && <ScenarioRail key={node.id} draft={node} update={updateNode} app={app} />}
      </div>
      {asking && <PrePlayDialog scenario={draft} busy={starting} onBegin={begin} onClose={() => setAsking(false)} />}
      {error !== null && <Toast message={error} error onDismiss={() => setError(null)} />}
    </div>
  );
}
