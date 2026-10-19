import { useState, type ReactNode } from 'react';
import type { Adventure } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import {
  downloadAdventureJson,
  downloadAdventureText,
  downloadStory,
  downloadStoryCards,
  downloadTraces,
  importStoryCardsFromFile,
  pickFile,
  saveAsScenario,
} from '@ui/transferUi';
import { CoverPicker } from '@ui/components/CoverPicker';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Switch } from '@ui/components/ui/switch';
import { Textarea } from '@ui/components/ui/textarea';
import { CodexButton } from '../codex/CodexButton';
import { SECTION, SECTION_BODY, SECTION_HEADER } from './Section';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (e: unknown) => alert(message(e));

function Group({ title, note, children }: { title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className={SECTION}>
      <header className={SECTION_HEADER}>
        <span className="grow">{title}</span>
      </header>
      <div className={SECTION_BODY}>
        <div className="flex items-center gap-2">{children}</div>
        <p className="m-0 text-caption text-muted-foreground">{note}</p>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </label>
  );
}

/** Format and quoting last only while the tab is open: an export choice, not a setting. */
function StoryExport({ adventure }: { adventure: Adventure }) {
  const [format, setFormat] = useState<'markdown' | 'epub'>('epub');
  const [quoted, setQuoted] = useState(false);
  const run = async () => {
    try {
      const missing = await downloadStory(adventure, format, quoted ? 'quoted' : 'narration');
      if (missing) alert(`${missing} picture${missing === 1 ? ' was' : 's were'} not found and left out.`);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Group title="Export as story" note="The prose and the pictures you kept, in chapters; no prompts, cards or memories.">
      <Select aria-label="Story format" className="w-auto" value={format} onChange={(e) => setFormat(e.target.value === 'markdown' ? 'markdown' : 'epub')}>
        <option value="epub">EPUB</option>
        <option value="markdown">Markdown</option>
      </Select>
      <Switch id="story-quoted" checked={quoted} onChange={setQuoted} />
      <label htmlFor="story-quoted" className="text-caption">
        Keep my lines as &gt; quotes
      </label>
      <Button onClick={() => void run()}>Export</Button>
    </Group>
  );
}

export function DetailsTab({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const importCards = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const { cards, warnings } = await importStoryCardsFromFile(file);
      api.setStoryCards([...adventure.storyCards, ...cards]);
      if (warnings.length > 0) alert(warnings.join('\n'));
    } catch (e) {
      alert(message(e));
    }
  };
  return (
    <>
      <Field label="Title">
        <Input value={adventure.title} onChange={(e) => api.updateMeta({ title: e.target.value })} />
      </Field>
      <Field label="Description">
        <Textarea value={adventure.description} onChange={(e) => api.updateMeta({ description: e.target.value })} />
      </Field>
      <CoverPicker
        ownerId={adventure.id}
        coverId={adventure.coverId}
        coverUrl={adventure.coverUrl}
        app={api.app}
        image={adventure.settings.image}
        onChange={(coverId) => api.updateMeta({ coverId })}
      />
      <Field label="Tags">
        <Input
          value={adventure.tags.join(', ')}
          onChange={(e) =>
            api.updateMeta({
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t !== ''),
            })
          }
        />
      </Field>
      <Group
        title="Story cards"
        note={
          <>
            JSON array of {'{'}keys, entry, type, title{'}'} — the same shape AI Dungeon exports.
          </>
        }
      >
        <Button onClick={() => void downloadStoryCards(adventure).catch(fail)}>Export cards</Button>
        <Button onClick={() => void importCards()}>Import cards</Button>
      </Group>
      <Group title="Codex" note="Everyone, every place and every event the story has recorded, compiled now; search it or export it as Markdown.">
        <CodexButton adventure={adventure} />
      </Group>
      <Group title="Download adventure" note="The JSON backup restores everything, including retries and settings; import it from the Library.">
        <Button onClick={() => void downloadAdventureJson(adventure).catch(fail)}>JSON (full backup)</Button>
        <Button onClick={() => void downloadAdventureText(adventure).catch(fail)}>Plain text</Button>
        <Button onClick={() => void downloadTraces(adventure).catch(fail)}>Turn traces (JSONL)</Button>
      </Group>
      <StoryExport adventure={adventure} />
      <Group
        title="Reuse the world"
        note="A new scenario in the Library with this opening, the cards, the people and places, and the confirmed rules. What happened in this story stays here."
      >
        <Button onClick={() => void saveAsScenario(adventure).then((s) => alert(`Saved "${s.title || 'Untitled'}" to the Library.`), fail)}>
          Save as scenario
        </Button>
      </Group>
    </>
  );
}
