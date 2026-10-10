import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getImageProgress, POLL_MS, withProgress } from '@app/session/imageProgress';
import type { ImageProgress, ImageProvider } from '@core/ports';

/** A provider whose progress answers come from `readings`, one per poll; `Error` entries reject. */
function provider(readings: (ImageProgress | Error)[]): { p: ImageProvider; polls: () => number } {
  let n = 0;
  const progress = () => {
    const r = readings[Math.min(n++, readings.length - 1)];
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const p = { progress } as Partial<ImageProvider> as ImageProvider;
  return { p, polls: () => n };
}

function job() {
  let release = () => {};
  const done = new Promise<string>((r) => {
    release = () => r('png');
  });
  return { release, run: () => done };
}

describe('withProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('measures the step rate between polls and derives the time left', async () => {
    const { p } = provider([
      { step: 2, steps: 40 },
      { step: 2, steps: 40 },
      { step: 3, steps: 40 },
    ]);
    const j = job();
    const out = withProgress('see', p, j.run);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(getImageProgress()).toEqual({ kind: 'see', step: 2, steps: 40 });
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    // One step in two seconds, 37 steps to go.
    expect(getImageProgress()).toEqual({ kind: 'see', step: 3, steps: 40, etaSeconds: 74 });
    j.release();
    expect(await out).toBe('png');
    expect(getImageProgress()).toBeUndefined();
  });

  it('starts the rate over on the second hires pass', async () => {
    const { p } = provider([
      { step: 1, steps: 20, pass: 1 },
      { step: 2, steps: 20, pass: 1 },
      { step: 1, steps: 20, pass: 2 },
    ]);
    const j = job();
    const out = withProgress('see', p, j.run);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(getImageProgress()).toEqual({ kind: 'see', step: 1, steps: 20, pass: 2 });
    j.release();
    await out;
  });

  it('stops polling after two failures and when the job ends', async () => {
    const failing = provider([new Error('404')]);
    const j = job();
    const out = withProgress('portrait', failing.p, j.run);
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(failing.polls()).toBe(2);
    j.release();
    await out;

    const ok = provider([{ step: 1, steps: 10 }]);
    const k = job();
    const done = withProgress('cover', ok.p, k.run);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    k.release();
    await done;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(ok.polls()).toBe(1);
  });
});
