import { useId, useState } from 'react';
import type { Scenario, StoryCard } from '@core/model';
import { toScriptCards, type HookName, type HookResult } from '@core/ports';
import { parseScriptState, testScript } from '@app/scripts';
import { Button } from '@ui/components/ui/button';
import { Textarea } from '@ui/components/ui/textarea';

type Scripts = NonNullable<Scenario['scripts']>;

/** Which hook each editor tab runs; Library has none, it is prepended to all of them. */
const HOOK_OF: Partial<Record<keyof Scripts, HookName>> = { input: 'onInput', context: 'onModelContext', output: 'onOutput' };

/** A sample prompt budget, so `info.maxChars` is plausible in the panel. [provisional] */
const SAMPLE_MAX_CHARS = 8000;

interface Props {
  tab: keyof Scripts;
  scripts: Scripts;
  cards: StoryCard[];
  plotEssentials: string;
  onLogs: (hook: string, lines: string[]) => void;
}

/** Runs one hook against sample input, without starting an adventure. */
export function ScriptTest({ tab, scripts, cards, plotEssentials, onLogs }: Props) {
  const [text, setText] = useState('');
  const [stateJson, setStateJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HookResult | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const hook = HOOK_OF[tab];

  const run = async (): Promise<void> => {
    if (hook === undefined) return;
    const parsed = parseScriptState(stateJson);
    if ('error' in parsed) {
      setError(`Sample state: ${parsed.error}`);
      return;
    }
    setError(null);
    setBusy(true);
    const r = await testScript(scripts, {
      hook,
      text,
      history: [],
      storyCards: toScriptCards(cards),
      state: parsed.state,
      info: {
        characterNames: [],
        actionCount: 0,
        ...(hook === 'onModelContext' ? { maxChars: SAMPLE_MAX_CHARS, memoryLength: plotEssentials.length } : {}),
      },
    });
    setBusy(false);
    setResult(r);
    onLogs(hook, [...r.logs, ...(r.error === undefined ? [] : [`error: ${r.error}`])]);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-control font-semibold">Script test</h3>
        <span className="grow" />
        <Button variant="primary" className="h-7" disabled={busy || hook === undefined} onClick={() => void run()} title="Ctrl/⌘+Enter">
          Run
        </Button>
      </div>
      {hook === undefined && (
        <p className="m-0 text-caption text-muted-foreground">Library runs before every hook; pick Input, Context or Output to test it.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-text`} className="text-caption text-muted-foreground">
          Sample input
        </label>
        <Textarea
          id={`${id}-text`}
          className="text-control"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run();
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-state`} className="text-caption text-muted-foreground">
          Sample state (JSON)
        </label>
        <Textarea id={`${id}-state`} className="font-mono text-control" value={stateJson} onChange={(e) => setStateJson(e.target.value)} />
      </div>
      {error !== null && <p className="m-0 text-caption text-destructive">{error}</p>}
      {result && <Result result={result} />}
    </section>
  );
}

const ROW = 'flex gap-2 font-mono text-caption';

function Result({ result }: { result: HookResult }) {
  return (
    <div aria-label="Test result" className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-3.5">
      {result.error !== undefined && <p className="m-0 text-caption text-destructive">error: {result.error}</p>}
      <div className={ROW}>
        <span className="text-muted-foreground">text</span>
        <span className="whitespace-pre-wrap text-prose">{result.text ?? '(unchanged)'}</span>
      </div>
      <div className={ROW}>
        <span className="text-muted-foreground">stop</span>
        <span>{result.stop === true ? 'true' : 'false'}</span>
      </div>
      <div className={ROW}>
        <span className="text-muted-foreground">logs</span>
        <span className="whitespace-pre-wrap">{result.logs.length === 0 ? '(none)' : result.logs.join('\n')}</span>
      </div>
      <div className={ROW}>
        <span className="text-muted-foreground">storyCards</span>
        <span className="truncate">
          {result.storyCards.length} · {result.storyCards.map((c) => c.keys).join(' | ')}
        </span>
      </div>
      <div className={ROW}>
        <span className="text-muted-foreground">state</span>
      </div>
      <pre className="m-0 font-mono text-caption whitespace-pre-wrap">{JSON.stringify(result.state, null, 2)}</pre>
      <div className={ROW}>
        <span className="text-muted-foreground">elapsed</span>
        <span>{result.elapsedMs} ms</span>
      </div>
    </div>
  );
}
