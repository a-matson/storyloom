import type { ContextBuildResult } from '@core/context';
import type { GameSnapshot } from '@app/session';

/** Command-row status: timing, prefix-cache hit and warm-up state of the last turn. */
export function turnStatus(state: GameSnapshot, backendLabel: string): string {
  if (state.busy) return 'generating…';
  const stats = state.actions.at(-1)?.stats;
  const prompt = stats?.promptTokens ?? 0;
  const parts = [
    stats?.promptMs === undefined ? backendLabel : `${((stats.promptMs + (stats.generationMs ?? 0)) / 1000).toFixed(1)} s`,
    prompt > 0 ? `${Math.round(((stats?.cachedTokens ?? 0) / prompt) * 100)}% cached` : '',
    state.warm === 'warm' ? 'next turn warm' : state.warm === 'warming' ? 'warming…' : '',
    state.context?.scriptCache && state.context.scriptCache !== 'kept' ? 'uncached: script' : '',
  ];
  return parts.filter((p) => p !== '').join(' · ');
}

/** What did not fit in the last context, or '' when everything did. */
export function overflowWarning(ctx: ContextBuildResult): string {
  const plotTrimmed = ctx.sections.some((s) => s.trimmed && s.kind !== 'history' && s.kind !== 'storyCards');
  return [
    ctx.droppedCards.length > 0 ? `${ctx.droppedCards.length} triggered story card(s) did not fit` : '',
    ctx.droppedSections.length > 0 ? `dropped: ${ctx.droppedSections.join(', ')}` : '',
    plotTrimmed ? 'a plot component was trimmed' : '',
  ]
    .filter((p) => p !== '')
    .join(' · ');
}
