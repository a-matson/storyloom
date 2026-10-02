import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Scenario } from '@core/model';
import { storage } from '@app/services';
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
  onExit: () => void;
}

/** Loads the scenario, then hands it to the editor; `key` resets the draft when the id changes. */
export function ScenarioEditor({ id, onExit }: Props) {
  const saved = useLiveQuery(async () => (await storage.getScenario(id)) ?? null, [id]);
  if (saved === undefined) return <div className="h-full" />;
  if (saved === null)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Scenario not found.</p>
        <Button onClick={onExit}>Back to library</Button>
      </div>
    );
  return <Editor key={id} saved={saved} onExit={onExit} />;
}

function Editor({ saved, onExit }: { saved: Scenario; onExit: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { draft, dirty, update, save } = useScenarioDraft(saved, setError);
  const [tab, setTab] = useState<Tab>('technical');
  const typeLabel = TYPES.find((t) => t.id === draft.type)?.label ?? draft.type;
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
        <Button variant="primary" onClick={save} title="Ctrl/⌘+S">
          Save
        </Button>
      </TopBar>
      <main className="flex grow flex-col gap-4.5 overflow-y-auto px-7 py-6 max-sm:p-4">
        {tab === 'basics' && <BasicsTab draft={draft} update={update} />}
        {tab === 'technical' && <TechnicalTab draft={draft} update={update} />}
        {tab === 'scripts' && <ScriptsTab draft={draft} update={update} />}
      </main>
      {error !== null && <Toast message={error} error onDismiss={() => setError(null)} />}
    </div>
  );
}
