import type { ReactNode } from 'react';
import type { Adventure } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { downloadAdventureJson, downloadAdventureText, downloadStoryCards, importStoryCardsFromFile, pickFile } from '@ui/transferUi';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Textarea } from '@ui/components/ui/textarea';
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
      <Group title="Download adventure" note="The JSON backup restores everything, including retries and settings; import it from the Library.">
        <Button onClick={() => void downloadAdventureJson(adventure).catch(fail)}>JSON (full backup)</Button>
        <Button onClick={() => void downloadAdventureText(adventure).catch(fail)}>Plain text</Button>
      </Group>
    </>
  );
}
