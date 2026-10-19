import { withChapter, type Chapter } from '@core/memory';
import type { PlotComponents } from '@core/model';
import { Button } from '@ui/components/ui/button';
import type { GameApi } from '@ui/hooks/useGameSession';

interface Props {
  starts: readonly Chapter[];
  /** The action the heading would stand before. */
  at: number;
  /** The stored entries the edit rewrites. */
  stored: PlotComponents['chapters'];
  api: GameApi;
}

const heading = 'font-sans text-control font-semibold text-muted-foreground';

/**
 * The heading of the chapter starting at `at`, if one does and there are two or more (one chapter is no structure).
 * A proposed title is an input: Keep confirms it, an edit (blur or Enter) confirms the new one.
 */
export function ChapterHeading({ starts, at, stored, api }: Props) {
  const n = starts.findIndex((c) => c.at === at);
  const chapter = starts[n];
  if (!chapter || starts.length < 2) return null;
  const label = `Chapter ${n + 1}`;
  const save = (title: string) => api.updatePlot({ chapters: withChapter(stored, { at: chapter.at, ...(title && { title }) }) });
  if (!chapter.title || chapter.seen !== false)
    return (
      <h2 data-chapter className={heading}>
        {chapter.title ? `${label} · ${chapter.title}` : label}
      </h2>
    );
  return (
    <div data-chapter className="flex items-center gap-2">
      <span className={heading}>{label} ·</span>
      <input
        aria-label={`${label} title (proposed)`}
        defaultValue={chapter.title}
        className="min-w-0 grow border-b border-border bg-transparent font-sans text-control text-muted-foreground outline-none"
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={(e) => e.target.value.trim() !== chapter.title && save(e.target.value.trim())}
      />
      <Button variant="ghost" className="h-7 px-2" aria-label={`Keep ${label} title`} onClick={() => save(chapter.title ?? '')}>
        Keep
      </Button>
    </div>
  );
}
