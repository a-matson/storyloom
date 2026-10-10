import { describe, expect, it, vi } from 'vitest';
import { ImageQueue, type ImageJobKind } from '@app/session/imageQueue';

/** A job that logs its start and finishes when released. */
function job(log: string[], name: string) {
  let release = () => {};
  const done = new Promise<void>((r) => {
    release = r;
  });
  const run = () => {
    log.push(name);
    return done.then(() => name);
  };
  return { release, run };
}

describe('ImageQueue', () => {
  it('runs one job at a time, in order', async () => {
    const q = new ImageQueue();
    const log: string[] = [];
    const a = job(log, 'a');
    const b = job(log, 'b');
    const pa = q.enqueue('portrait', a.run);
    const pb = q.enqueue('portrait', b.run);
    await Promise.resolve();
    expect(log).toEqual(['a']);
    a.release();
    expect(await pa).toBe('a');
    await vi.waitFor(() => expect(log).toEqual(['a', 'b']));
    b.release();
    expect(await pb).toBe('b');
  });

  it('runs a See image before queued portraits', async () => {
    const q = new ImageQueue();
    const log: string[] = [];
    const jobs = (['portrait', 'portrait', 'portrait', 'see'] as ImageJobKind[]).map((kind, i) => ({ kind, ...job(log, `${kind}${i}`) }));
    const done = jobs.map((j) => q.enqueue(j.kind, j.run));
    for (const j of jobs) j.release();
    await Promise.all(done);
    expect(log).toEqual(['portrait0', 'see3', 'portrait1', 'portrait2']);
  });

  it('a rejected job does not block the queue', async () => {
    const q = new ImageQueue();
    const failed = q.enqueue('see', () => Promise.reject(new Error('busy')));
    const next = q.enqueue('see', () => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('busy');
    expect(await next).toBe('ok');
  });
});
