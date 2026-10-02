import type { Action, Adventure } from '@core/model';
import { buildWarmupPrompt, generateAlternative, type PreparedContext, type TurnDeps } from '@core/turn';
import type { Prefetched } from './types';

interface IdleCallbacks {
  onPrefetched: (p: Prefetched) => void;
  onWarm: (state: 'warming' | 'warm' | 'idle') => void;
}

/**
 * Between turns: warm the backend's KV cache with the next turn's stable prefix and, if enabled,
 * prefetch one retry alternative on a second slot. Best-effort; `signal` cancels both.
 */
export async function runIdleWork(
  adventure: Adventure,
  actions: Action[],
  lastPrepared: PreparedContext | null,
  deps: TurnDeps,
  signal: AbortSignal,
  cb: IdleCallbacks,
): Promise<void> {
  const caps = await deps.provider.capabilities().catch(() => null); // backend gone: nothing to warm
  if (!caps || signal.aborted) return;
  const ctx = adventure.settings.context;
  const last = actions.at(-1);
  const jobs: Promise<unknown>[] = [];

  if (ctx.retryPrefetch && caps.parallelSlots > 1 && last?.type === 'continue' && lastPrepared) {
    jobs.push(
      (async () => {
        try {
          const alt = await generateAlternative(adventure, lastPrepared, deps, last.id, signal, 1);
          if (!signal.aborted && alt.text.trim()) cb.onPrefetched({ actionId: last.id, text: alt.text, stats: alt.stats, trace: alt.trace });
        } catch {
          // best-effort: Retry falls back to a normal generation
        }
      })(),
    );
  }

  if (ctx.cacheWarming && caps.prefixCache) {
    cb.onWarm('warming');
    jobs.push(
      (async () => {
        try {
          const prompt = await buildWarmupPrompt(adventure, actions, deps);
          if (!prompt || signal.aborted) return;
          for await (const _ of deps.provider.complete({ prompt, maxTokens: 0, temperature: 0, cachePrompt: true, slotId: 0, prefillOnly: true }, signal)) {
            // drain the prefill
          }
          if (!signal.aborted) cb.onWarm('warm');
        } catch {
          if (!signal.aborted) cb.onWarm('idle'); // warm-up failed: next turn is just slower
        }
      })(),
    );
  }
  await Promise.all(jobs);
}
