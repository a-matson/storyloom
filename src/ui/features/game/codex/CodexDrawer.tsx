import { useEffect, useState } from 'react';
import { loadMemoryJobs, type CodexEntry, type CodexLine } from '@core/memory';
import type { Adventure } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { TopBarTitle } from '@ui/components/ui/top-bar';
import { Section } from '../sidebar/Section';

type Jobs = Awaited<ReturnType<typeof loadMemoryJobs>>;

interface Props {
  adventure: Adventure;
  onClose: () => void;
  // Passed in: importing them here split a shared chunk onto the start-up path (+0.3 kB).
  onShow: (at: number) => void;
  onExport: (markdown: string) => void;
}

/** A line from an action jumps to it, as a card's evidence does. */
function Lines({ lines, onShow }: { lines: CodexLine[]; onShow: (at: number) => void }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-control">
      {lines.map(({ text, at }) => (
        <li key={`${at ?? ''}:${text}`}>
          {at === undefined ? (
            text
          ) : (
            <button type="button" className="cursor-pointer text-left hover:underline" title={`Show action ${at}`} onClick={() => onShow(at)}>
              {text}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Entries({ title, entries, onShow }: { title: string; entries: CodexEntry[]; onShow: (at: number) => void }) {
  return (
    entries.length > 0 && (
      <Section title={title} badge={<span className="text-caption text-muted-foreground">{entries.length}</span>} defaultOpen>
        {entries.map((e) => (
          <div key={e.title} className="flex flex-col gap-1">
            {e.title && <h3 className="m-0 text-control font-semibold">{e.title}</h3>}
            <Lines lines={e.lines} onShow={onShow} />
          </div>
        ))}
      </Section>
    )
  );
}

/** Read-only: compiled from the store on each render while open, never saved. */
export function CodexDrawer({ adventure, onClose, onShow, onExport }: Props) {
  const [jobs, setJobs] = useState<Jobs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    loadMemoryJobs().then(setJobs, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const all = jobs?.compileCodex(adventure);
  const codex = all && jobs?.filterCodex(all, query);
  const show = (at: number) => {
    onClose();
    onShow(at);
  };
  return (
    <Drawer label="Codex" onClose={onClose}>
      <DrawerHeader title={<TopBarTitle>Codex</TopBarTitle>} onClose={onClose}>
        <Button disabled={!all} onClick={() => all && jobs && onExport(jobs.codexMarkdown(all))}>
          Export Markdown
        </Button>
      </DrawerHeader>
      <DrawerBody>
        <input
          type="search"
          aria-label="Search the codex"
          placeholder="Search"
          className="h-9 rounded-md border border-border bg-secondary px-3 text-control"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error !== null && <p className="m-0 text-destructive">{error}</p>}
        {codex && (
          <>
            <Entries title="Characters" entries={codex.characters} onShow={show} />
            <Entries title="Places" entries={codex.places} onShow={show} />
            <Entries title="Things" entries={codex.things} onShow={show} />
            <Entries title="Rules" entries={codex.rules.length ? [{ title: '', lines: codex.rules }] : []} onShow={show} />
            <Entries title="Timeline" entries={codex.timeline.length ? [{ title: '', lines: codex.timeline }] : []} onShow={show} />
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}
