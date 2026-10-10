import type { ImageProgress, ImageProvider } from '@core/ports';
import type { ImageJobKind } from './imageQueue';

export interface ImageProgressView extends ImageProgress {
  kind: ImageJobKind;
  /** Unset until two readings a step apart give a rate. */
  etaSeconds?: number | undefined;
}

export const POLL_MS = 1000; // [provisional]

/** One job renders at a time per page (the image queue), so one value, not one per job. */
let current: ImageProgressView | undefined;
const listeners = new Set<() => void>();

export const getImageProgress = (): ImageProgressView | undefined => current;
export function subscribeImageProgress(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function publish(next: ImageProgressView | undefined): void {
  current = next;
  for (const fn of listeners) fn();
}

/**
 * Runs `job` and polls the server's progress meanwhile. The rate is measured between readings
 * rather than taken from `eta_relative`, which A1111-likes fill unevenly. Two failed polls stop the
 * polling for this job; the UI then falls back to its elapsed counter.
 */
export async function withProgress<T>(kind: ImageJobKind, provider: ImageProvider, job: () => Promise<T>): Promise<T> {
  const poll = provider.progress?.bind(provider);
  if (!poll) return job();
  let failures = 0;
  let last: { at: number; step: number; pass: number | undefined } | undefined;
  let rate: number | undefined;
  const tick = async () => {
    try {
      const p = await poll(AbortSignal.timeout(POLL_MS));
      if (!p) return;
      const at = performance.now();
      // A new hires pass has its own step count and size, so its rate starts over.
      if (last && last.pass !== p.pass) [last, rate] = [undefined, undefined];
      if (last && p.step > last.step) rate = (at - last.at) / 1000 / (p.step - last.step);
      if (!last || p.step !== last.step) last = { at, step: p.step, pass: p.pass };
      if (timer !== undefined) publish({ kind, ...p, ...(rate !== undefined && { etaSeconds: Math.round((p.steps - p.step) * rate) }) });
    } catch (e) {
      if (++failures < 2) return;
      console.warn('image progress unavailable; showing elapsed time', e);
      stop();
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => void tick(), POLL_MS);
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  try {
    return await job();
  } finally {
    stop();
    publish(undefined);
  }
}
