import type { JobKind } from '../model/types';

/**
 * Which background job held a generation slot while a turn was in flight (Gate V finding 19).
 * Slots share one GPU, so a slow turn is usually a turn that overlapped a memory, summary or card
 * job; the turn's trace records the overlap so a live run can attribute it instead of guessing.
 */
interface JobWindow {
  job: JobKind;
  from: number;
  /** `Infinity` while the job is still running. */
  to: number;
}

/** Windows kept; only the newest turn reads them, so a short ring is enough. [provisional] */
const MAX_WINDOWS = 64;

const windows: JobWindow[] = [];

/** Records one background model call's span around `fn`. */
export async function trackJob<T>(job: JobKind, fn: () => Promise<T>): Promise<T> {
  const w: JobWindow = { job, from: Date.now(), to: Number.POSITIVE_INFINITY };
  windows.push(w);
  if (windows.length > MAX_WINDOWS) windows.shift();
  try {
    return await fn();
  } finally {
    w.to = Date.now();
  }
}

/** Jobs that ran during `[from, to]`, with the milliseconds each one overlapped. */
export function overlappingJobs(from: number, to: number): { job: JobKind; ms: number }[] {
  const ms = new Map<JobKind, number>();
  for (const w of windows) {
    const over = Math.min(to, w.to) - Math.max(from, w.from);
    if (over > 0) ms.set(w.job, (ms.get(w.job) ?? 0) + over);
  }
  return [...ms].map(([job, over]) => ({ job, ms: Math.round(over) }));
}

/** Tests only: forget every window. */
export function clearJobLog(): void {
  windows.length = 0;
}
