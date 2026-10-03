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

interface IdleHost extends IdleCallbacks {
  adventure: () => Adventure;
  actions: () => Action[];
  deps: () => TurnDeps;
  busy: () => boolean;
  /** Quiet time after the last edit before re-warming. */
  delayMs: () => number;
}

/** Owns the running idle work and the pending re-warm after edits. */
export class IdleWork {
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly host: IdleHost;
  constructor(host: IdleHost) {
    this.host = host;
  }

  /** Starts idle work; the returned signal is shared with memory jobs so a new action stops both. */
  start(prepared: PreparedContext | null): AbortSignal {
    this.stop();
    const ac = new AbortController();
    this.abort = ac;
    const h = this.host;
    void runIdleWork(h.adventure(), h.actions(), prepared, h.deps(), ac.signal, h);
    return ac.signal;
  }

  /** An edit changed the prompt: stop, then re-warm once edits stop so the next turn does not prefill cold. */
  afterEdit(): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.host.busy()) this.start(null);
    }, this.host.delayMs());
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
  }
}
