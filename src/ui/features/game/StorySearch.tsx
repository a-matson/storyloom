import { useState, type FocusEvent } from 'react';
import { loadSearch, type SearchDoc } from '@core/memory';
import type { Adventure } from '@core/model';
import { Input } from '@ui/components/ui/field';
import { showAction } from './entities/EntityDetails';

const GROUPS = [
  ['action', 'Story'],
  ['memory', 'Memories'],
  ['event', 'Events'],
] as const;

type Core = Awaited<ReturnType<typeof loadSearch>>;

/** Scroll to the action and flash it, so the eye finds it in a long column. */
function jump(d: SearchDoc) {
  showAction(d.at)?.animate([{ backgroundColor: 'color-mix(in oklab, var(--lantern) 25%, transparent)' }, { backgroundColor: 'transparent' }], {
    duration: 1500,
  });
}

/** Full-text search over the story, memories and events; `/` focuses it (`useGameKeys`), Enter jumps to the best hit. */
export function StorySearch({ adventure }: { adventure: Adventure }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [core, setCore] = useState<Core>();
  const [error, setError] = useState<string>();
  // The compiler keeps this array while the adventure is unchanged, so its index is built once.
  const docs = core?.searchDocs(adventure) ?? [];
  const results = open && core ? core.searchStory(docs, query) : [];
  const show = () => {
    setOpen(true);
    if (!core) loadSearch().then(setCore, (x: unknown) => setError(x instanceof Error ? x.message : String(x)));
  };
  const pick = (d: SearchDoc) => {
    setOpen(false);
    jump(d);
  };
  // Focus moving between the input and its results keeps the list open.
  const leave = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.closest('search')?.contains(e.relatedTarget)) setOpen(false);
  };

  return (
    <search className="relative w-48 max-sm:max-w-28">
      <Input
        onBlur={leave}
        id="story-search"
        type="search"
        aria-label="Search the story"
        aria-keyshortcuts="/"
        placeholder="Search  /"
        className="h-8 text-caption"
        value={query}
        onFocus={show}
        onChange={(e) => {
          setQuery(e.target.value);
          show();
        }}
        onKeyDown={(e) => {
          const first = results[0];
          if (e.key === 'Enter' && first) pick(first);
          else if (e.key === 'Escape') {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
      />
      {open && query.trim() !== '' && (
        <div className="absolute top-full right-0 z-30 mt-1 max-h-80 w-80 overflow-y-auto rounded-lg border border-border bg-card p-1 text-caption shadow-lg">
          {core && results.length === 0 && <p className="p-2 text-muted-foreground">Nothing found.</p>}
          {error !== undefined && <p className="p-2 text-muted-foreground">Search did not load: {error}</p>}
          {GROUPS.map(([kind, label]) => {
            const hits = results.filter((d) => d.kind === kind);
            return (
              hits.length > 0 && (
                <section key={kind} aria-label={label}>
                  <h3 className="p-2 font-medium text-muted-foreground">{label}</h3>
                  {hits.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="block w-full cursor-pointer rounded-sm border-0 bg-transparent p-2 text-left text-muted-foreground hover:text-prose"
                      onClick={() => pick(d)}
                      onBlur={leave}
                    >
                      {core?.snippet(d.text, query)}
                    </button>
                  ))}
                </section>
              )
            );
          })}
        </div>
      )}
    </search>
  );
}
