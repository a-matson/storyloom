import { useState } from 'react';
import { placeholderQuestions, type AppSettings, type Scenario, type StoryCard } from '@core/model';
import { DEFAULT_GENERATOR_SETTINGS, MAX_STORY_CARDS } from '@core/cards';
import { providerFor } from '@app/services';
import { Button } from '@ui/components/ui/button';
import { Pill } from '@ui/components/ui/pill';
import { cn } from '@ui/lib/utils';
import { CardDialog } from '../game/cards/CardDialog';
import { tone } from '../game/cards/tone';
import { HOOKS } from './ScriptsTab';
import type { TabProps } from './fields';

const BOX = 'flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3.5';
const HEADING = 'text-caption font-semibold uppercase tracking-[0.06em] text-muted-foreground';
const FIRST = 4;

/** Right rail of the editor: what the player will be asked, the cards, which scripts exist. */
export function ScenarioRail({ draft, update, app }: TabProps & { app: AppSettings }) {
  const cards = draft.storyCards;
  const creator = draft.type === 'characterCreator';
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<StoryCard | 'new' | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  // Generator settings are per adventure; here they only last for this editing session.
  const [generator, setGenerator] = useState(DEFAULT_GENERATOR_SETTINGS);

  const save = (card: StoryCard, next?: 'close' | 'new') => {
    // An emptied entry deletes the card, as in the game.
    const exists = cards.some((c) => c.id === card.id);
    const rest = cards.filter((c) => c.id !== card.id);
    update({ storyCards: card.entry === '' ? rest : exists ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card] });
    setEditing(next === 'new' ? 'new' : null);
    if (next === 'new') setDialogKey((k) => k + 1);
  };

  return (
    <aside aria-label="Scenario overview" className="flex w-105 shrink-0 flex-col gap-4 overflow-y-auto bg-card p-6 max-lg:w-full max-lg:shrink">
      <Placeholders draft={draft} />

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-control font-semibold">Story cards</h2>
          <span className="text-caption text-muted-foreground">{cards.length}</span>
          <span className="grow" />
          <Button variant="primary" className="h-7" onClick={() => setEditing('new')} disabled={cards.length >= MAX_STORY_CARDS}>
            + New
          </Button>
        </div>
        {(all ? cards : cards.slice(0, FIRST)).map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={`Edit story card ${c.name}`}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left"
            onClick={() => setEditing(c)}
          >
            <Pill tone={tone(c.type)}>{c.type}</Pill>
            <span className="truncate text-control font-medium">{c.name}</span>
            {creator && c.selectable && <Pill tone="auto">pick</Pill>}
            <span className="grow" />
            <span className="max-w-35 truncate font-mono text-label text-muted-foreground">{c.triggers.join(', ')}</span>
          </button>
        ))}
        {!all && cards.length > FIRST && (
          <button type="button" className="h-9 rounded-lg border border-dashed border-border text-caption text-muted-foreground" onClick={() => setAll(true)}>
            Show {cards.length - FIRST} more
          </button>
        )}
      </section>

      <Scripts scripts={draft.scripts} />

      {editing !== null && (
        <CardDialog
          key={dialogKey}
          context={{ generator, storySummary: draft.plot.storySummary, template: app.defaults.template, creator }}
          provider={providerFor(app, app.defaultProviderId)}
          card={editing === 'new' ? undefined : editing}
          onSave={save}
          onSettings={setGenerator}
          onClose={() => setEditing(null)}
        />
      )}
    </aside>
  );
}

function Placeholders({ draft }: { draft: Scenario }) {
  const questions = placeholderQuestions(draft);
  return (
    <section className={BOX}>
      <div className="flex items-center gap-2">
        <h2 className={HEADING}>Placeholders</h2>
        <span className="grow" />
        <span className="text-caption text-muted-foreground">detected in prompt &amp; cards</span>
      </div>
      {questions.length === 0 && <p className="m-0 text-caption text-muted-foreground">None. Write {'${question}'} to ask the player before play.</p>}
      {questions.map((q) => (
        <div key={q.key} className="flex items-center gap-2.5 rounded-lg bg-secondary px-2.5 py-2 text-caption">
          <span className="truncate font-mono text-primary">{`\${${q.key}}`}</span>
          <span className="grow" />
          <span className="shrink-0 text-muted-foreground">{q.label === q.key ? '' : q.label}</span>
          {q.uses > 1 && <span className="shrink-0 text-muted-foreground">asked once</span>}
        </div>
      ))}
    </section>
  );
}

function Scripts({ scripts }: { scripts: Scenario['scripts'] }) {
  return (
    <section className={BOX}>
      <h2 className={HEADING}>Scripts</h2>
      <div className="grid grid-cols-4 gap-1.5 font-mono text-label">
        {HOOKS.map((h) => (
          <span
            key={h.key}
            title={scripts?.[h.key] ? 'has code' : 'empty'}
            className={cn('rounded-md bg-secondary px-2 py-1.5 text-center', scripts?.[h.key] ? 'text-foreground' : 'text-muted-foreground')}
          >
            {h.label}
          </span>
        ))}
      </div>
    </section>
  );
}
