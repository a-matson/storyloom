import type { CompletionStats } from '@core/ports';

/** Backend timings for the last generation. */
export function StatsFooter({ stats }: { stats: CompletionStats }) {
  const prompt = stats.promptTokens ?? 0;
  const generated = stats.generatedTokens ?? 0;
  const genMs = stats.generationMs ?? 0;
  return (
    <footer className="flex items-center gap-3.5 border-t border-border px-6 py-2.5 font-mono text-caption text-muted-foreground">
      {stats.promptTokens !== undefined && (
        <span>
          prompt eval {stats.promptTokens.toLocaleString()} tok{stats.promptMs === undefined ? '' : ` · ${(stats.promptMs / 1000).toFixed(2)} s`}
        </span>
      )}
      {stats.generatedTokens !== undefined && (
        <span>
          generation {stats.generatedTokens} tok{stats.generationMs === undefined ? '' : ` · ${(stats.generationMs / 1000).toFixed(1)} s`}
        </span>
      )}
      {prompt > 0 && <span>cache hit {Math.round(((stats.cachedTokens ?? 0) / prompt) * 100)}%</span>}
      {generated > 0 && genMs > 0 && <span>{(generated / (genMs / 1000)).toFixed(1)} tok/s</span>}
    </footer>
  );
}
