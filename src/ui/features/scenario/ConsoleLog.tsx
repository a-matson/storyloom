import { Button } from '@ui/components/ui/button';

const MAX_LINES = 500; // [provisional]

/** Appends one run's lines, newest last; the log is kept for the editor's lifetime, not persisted. */
export function appendLog(lines: string[], hook: string, added: string[]): string[] {
  if (added.length === 0) return lines;
  const at = new Date().toLocaleTimeString();
  return [...lines, ...added.map((l) => `[${hook} ${at}] ${l}`)].slice(-MAX_LINES);
}

export function ConsoleLog({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-control font-semibold">Console</h3>
        <span className="text-caption text-muted-foreground">{lines.length}</span>
        <span className="grow" />
        <Button variant="ghost" className="h-7 px-2 text-label" onClick={onClear} disabled={lines.length === 0}>
          Clear
        </Button>
      </div>
      <div aria-label="Console log" className="min-h-30 overflow-y-auto rounded-md border border-border bg-bar px-3 py-2">
        {lines.length === 0 ? (
          <p className="m-0 text-caption text-muted-foreground">log() output from test runs appears here.</p>
        ) : (
          <pre className="m-0 font-mono text-caption whitespace-pre-wrap">{lines.join('\n')}</pre>
        )}
      </div>
    </section>
  );
}
