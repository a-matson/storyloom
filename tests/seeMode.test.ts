import { describe, expect, it, vi } from 'vitest';
import { createBlankAdventure } from '@core/model';
import type { ImageProvider, ImageRequest } from '@core/ports';
import { setup } from './fixtures/session';

const fakeImages = (txt2img: ImageProvider['txt2img']): ImageProvider => ({
  id: 'img',
  baseUrl: 'http://img.invalid',
  health: () => Promise.resolve(true),
  models: () => Promise.resolve([]),
  samplers: () => Promise.resolve([]),
  txt2img,
  // The hires pass lives inside the adapter's txt2img; the session never calls img2img itself.
  img2img: () => Promise.reject(new Error('not called by the session')),
});

type Session = ReturnType<typeof setup>['session'];
/** The See action once its prompt is composed (a lazy import away). */
const seeAction = (session: Session) =>
  vi.waitFor(
    () => {
      const a = session.getSnapshot().actions.findLast((x) => x.type === 'see');
      if (!a) throw new Error('no See action yet');
      return a;
    },
    { interval: 1 },
  );
// A blank adventure has no tags, so the neutral style is appended.
const STYLE = 'painted illustration, soft light';

describe('See mode', () => {
  it('appends the caption before the image arrives, then patches the action with the stored image id', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    let answer: (() => void) | undefined;
    const { session, images } = setup({ images: fakeImages(() => new Promise((r) => (answer = () => r(blob)))) });
    session.see('  a lantern  ');
    // The caption is on screen before the image server answers.
    const seen = await seeAction(session);
    expect(seen.image?.brief).toBe('a lantern');
    expect(seen.image?.prompt).toBe(`a lantern, ${STYLE}`);
    expect(seen.image?.imageId).toBeUndefined();
    await vi.waitFor(() => expect(answer).toBeDefined());
    answer?.();
    expect(session.getSnapshot().busy).toBe(false);
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeDefined());
    const imageId = session.getSnapshot().actions.at(-1)?.image?.imageId;
    expect(images.get(`${session.getSnapshot().adventure.id}|${imageId ?? ''}`)).toBe(blob);
    expect(session.getSnapshot().error).toBeNull();
  });

  it('keeps the action without an image when the server fails, and reports why', async () => {
    const { session } = setup({ images: fakeImages(() => Promise.reject(new Error('no model loaded'))) });
    session.see('a harbour');
    await vi.waitFor(() => expect(session.getSnapshot().error).toContain('no model loaded'));
    expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeUndefined();
    // Nothing is running any more, so the block shows its failed state instead of "Generating…".
    expect(session.getSnapshot().pendingImages).toEqual([]);
  });

  it('abandons a txt2img that never answers, keeps the prompt and retries', async () => {
    let hang = true;
    const { session } = setup({
      imageTimeoutMs: 20,
      images: fakeImages(
        (_req, signal) =>
          new Promise<Blob>((resolve, reject) => {
            if (!hang) return resolve(new Blob(['png']));
            signal?.addEventListener('abort', () => reject(signal.reason as Error));
          }),
      ),
    });
    session.see('a lantern');
    const action = await seeAction(session);
    expect(session.getSnapshot().pendingImages).toEqual([action.id]);
    await vi.waitFor(() => expect(session.getSnapshot().error).toContain('did not answer'));
    expect(session.getSnapshot().pendingImages).toEqual([]);
    expect(session.getSnapshot().actions.at(-1)?.image?.brief).toBe('a lantern');

    hang = false;
    session.regenerateSee(action?.id ?? '');
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeDefined());
  });

  it('says so when no image server is configured', async () => {
    const { session } = setup();
    session.see('a harbour');
    await vi.waitFor(() => expect(session.getSnapshot().error).toContain('No image server'));
    expect(session.getSnapshot().actions.some((a) => a.type === 'see')).toBe(true);
  });

  it('retries with a fresh image and drops the old blob', async () => {
    let n = 0;
    const { session, images } = setup({ images: fakeImages(() => Promise.resolve(new Blob([`png${++n}`]))) });
    session.see('a lantern');
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeDefined());
    const action = session.getSnapshot().actions.at(-1);
    const first = action?.image?.imageId ?? '';
    session.regenerateSee(action?.id ?? '');
    // The patch clears `imageId` first, so wait for the second one rather than for any change.
    await vi.waitFor(() => {
      const id = session.getSnapshot().actions.at(-1)?.image?.imageId;
      expect(id !== undefined && id !== first).toBe(true);
    });
    const adv = session.getSnapshot().adventure.id;
    expect(images.has(`${adv}|${first}`)).toBe(false);
    expect(await images.get(`${adv}|${session.getSnapshot().actions.at(-1)?.image?.imageId ?? ''}`)?.text()).toBe('png2');
    // Editing the caption is not a retry alternative: the action keeps its single version.
    expect(session.getSnapshot().actions.at(-1)?.versions).toHaveLength(1);
  });

  it('edits the prompt and generates again', async () => {
    const prompts: string[] = [];
    const { session } = setup({
      images: fakeImages((r) => {
        prompts.push(r.prompt);
        return Promise.resolve(new Blob(['png']));
      }),
    });
    session.see('a lantern');
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeDefined());
    session.regenerateSee(session.getSnapshot().actions.at(-1)?.id ?? '', '  a lantern at dusk  ');
    await vi.waitFor(() => expect(prompts).toEqual([`a lantern, ${STYLE}`, `a lantern at dusk, ${STYLE}`]));
    expect(session.getSnapshot().actions.at(-1)?.image).toMatchObject({ brief: 'a lantern at dusk', prompt: `a lantern at dusk, ${STYLE}` });
  });

  it('turns names into looks, tags the image, and recomposes a new brief', async () => {
    const prompts: string[] = [];
    const adventure = createBlankAdventure('Test', 'You stand at the gate.');
    const base = { kind: 'character' as const, aliases: [], facts: [], state: {}, relations: [], firstSeen: 0, lastSeen: 0 };
    adventure.entities = [
      { ...base, id: 'ent_t', name: 'Tamsin', description: 'Tamsin is a ferrywoman.', appearance: 'grey braid' },
      { ...base, id: 'ent_b', name: 'Bram', description: 'A toll keeper.' },
    ];
    adventure.plot.scene = { location: 'the jetty', present: ['Bram'] };
    const { session } = setup({ adventure, images: fakeImages(async (r) => (prompts.push(r.prompt), new Blob(['png']))) });
    session.see('Tamsin at the ferry');
    const action = await seeAction(session);
    expect(action.image).toMatchObject({ brief: 'Tamsin at the ferry', entityIds: ['ent_t'] });
    expect(action.image?.prompt).toBe(`a ferrywoman, grey braid at the ferry, the jetty, ${STYLE}`);
    session.regenerateSee(action.id, 'an empty boat');
    await vi.waitFor(() => expect(prompts).toHaveLength(2));
    expect(session.getSnapshot().actions.at(-1)?.image).toMatchObject({ brief: 'an empty boat', entityIds: ['ent_b'] });
    expect(prompts[1]).toBe(`an empty boat, a toll keeper, the jetty, ${STYLE}`);
  });

  it('sends /raw and a raw prompt edit as written, without a brief', async () => {
    const prompts: string[] = [];
    const { session } = setup({ images: fakeImages(async (r) => (prompts.push(r.prompt), new Blob(['png']))) });
    session.see('/raw Tamsin, masterpiece');
    const action = await seeAction(session);
    expect(action.image?.prompt).toBe('Tamsin, masterpiece');
    expect(action.image?.brief).toBeUndefined();
    session.regenerateSee(action.id, 'a boat');
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.brief).toBe('a boat'));
    session.regenerateSee(action.id, '/raw  boat, river ');
    await vi.waitFor(() => expect(prompts).toEqual(['Tamsin, masterpiece', `a boat, ${STYLE}`, 'boat, river']));
    expect(session.getSnapshot().actions.at(-1)?.image?.brief).toBeUndefined();
  });

  it('deletes the blob when an erase removes the action', async () => {
    const { session, images } = setup({ images: fakeImages(() => Promise.resolve(new Blob(['png']))) });
    session.see('a lantern');
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeDefined());
    const action = session.getSnapshot().actions.at(-1);
    const adv = session.getSnapshot().adventure.id;
    session.eraseTo(action?.id ?? '');
    await vi.waitFor(() => expect(images.has(`${adv}|${action?.image?.imageId ?? ''}`)).toBe(false));
    // Undo brings the caption back without the picture; the UI falls back to the pending skeleton and offers Retry.
    session.undo();
    expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBe(action?.image?.imageId);
    expect(images.size).toBe(0);
  });

  it('stores nothing when the action is erased while the server works', async () => {
    let resolve: ((b: Blob) => void) | undefined;
    const { session, images } = setup({ images: fakeImages(() => new Promise<Blob>((r) => (resolve = r))) });
    session.see('a lantern');
    const action = await seeAction(session);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    session.eraseTo(action.id);
    resolve?.(new Blob(['png']));
    await new Promise((r) => setTimeout(r, 0));
    expect(session.getSnapshot().actions.some((a) => a.type === 'see')).toBe(false);
    expect(images.size).toBe(0);
  });

  it('writes the prompt with the helper model when the input is blank', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const { session } = setup({ images: fakeImages(() => Promise.resolve(blob)) });
    session.see('   ');
    await vi.waitFor(() => expect(session.getSnapshot().actions.some((a) => a.type === 'see')).toBe(true));
    const prompt = session.getSnapshot().actions.at(-1)?.image?.prompt ?? '';
    expect(prompt).not.toBe('');
    expect(prompt).not.toContain('\n');
    expect(session.getSnapshot().error).toBeNull();
  });

  it('gives a hires render twice the time, since it is two renders in one call', async () => {
    const adventure = createBlankAdventure('Test', 'You stand at the gate.');
    adventure.settings.image = { ...adventure.settings.image, hires: true };
    const hang: ImageProvider['txt2img'] = (_req, signal) =>
      new Promise<Blob>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason as Error)));
    const { session } = setup({ adventure, imageTimeoutMs: 600, images: fakeImages(hang) });
    session.see('a lantern');
    // Both round to "1 s" in the message, so the elapsed time is what tells 600 ms from 1200 ms.
    const started = performance.now();
    await vi.waitFor(() => expect(session.getSnapshot().error).toContain('did not answer'), { timeout: 3000 });
    expect(performance.now() - started).toBeGreaterThan(1000);
  });

  it('sends the model-card settings, and the hires pass only when it is on', async () => {
    const calls: ImageRequest[] = [];
    const adventure = createBlankAdventure('Test', 'You stand at the gate.');
    adventure.settings.image = { ...adventure.settings.image, sampler: 'DPM++ 2M Karras', clipSkip: 2 };
    const { session } = setup({ adventure, images: fakeImages(async (req) => (calls.push(req), new Blob(['png']))) });
    session.see('a lantern');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ sampler: 'DPM++ 2M Karras', clipSkip: 2 });
    expect(calls[0]?.hires).toBeUndefined();

    session.updateSettings({ image: { ...adventure.settings.image, hires: true } });
    session.see('a harbour');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.hires).toEqual({ scale: 1.5, denoise: 0.55, steps: undefined });
  });
});
