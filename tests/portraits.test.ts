import { describe, expect, it, vi } from 'vitest';
import { entityEdits } from '@app/session/entities';
import { PORTRAIT_PX, PORTRAIT_RETRY_TURNS, queuePortraits, renderPortrait } from '@app/session/portraits';
import { portraitPrompt, portraitStyle } from '@app/session/portraitPrompt';
import { createBlankAdventure, type Entity } from '@core/model';
import type { ImageProvider, ImageRequest } from '@core/ports';
import { settled, setup } from './fixtures/session';

// No canvas under vitest; the re-encode is the browser's job.
vi.mock('@app/image', () => ({ downscale: (b: Blob) => Promise.resolve(b) }));

const lena: Entity = {
  id: 'ent_lena',
  kind: 'character',
  name: 'Lena',
  aliases: [],
  description: 'A ferrywoman.',
  facts: [
    { id: 'f1', text: 'She has grey hair.', fromAction: 0, source: 'memory' },
    { id: 'f2', text: 'She owes the mayor money.', fromAction: 0, source: 'memory' },
    { id: 'f3', text: 'She wears a patched coat.', fromAction: 0, source: 'memory' },
    { id: 'f4', text: 'A scar runs over her chin.', fromAction: 0, source: 'memory' },
    { id: 'f5', text: 'Her eyes are green.', fromAction: 0, source: 'memory' },
  ],
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
};
const gate: Entity = { ...lena, id: 'ent_gate', kind: 'place', name: 'Gate', facts: [] };

function withImages(txt2img: ImageProvider['txt2img'] | null, ...entities: Entity[]) {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = entities;
  // Model-card settings on, so every test also proves portraits skip the hires pass.
  adventure.settings.image = { ...adventure.settings.image, sampler: 'DPM++ 2M Karras', clipSkip: 2, hires: true };
  const images: ImageProvider | undefined = txt2img
    ? {
        id: 'img',
        baseUrl: 'http://img.invalid',
        health: async () => true,
        models: async () => [],
        samplers: async () => [],
        txt2img,
        img2img: () => Promise.reject(new Error('portraits never redraw')),
      }
    : undefined;
  return setup({ adventure, ...(images && { images }) });
}

const portraitOf = (s: ReturnType<typeof setup>['session'], id: string) => s.getSnapshot().adventure.entities.find((e) => e.id === id)?.portraitId;

describe('portraitPrompt', () => {
  it('carries the description, at most two appearance facts and the style', () => {
    expect(portraitPrompt(lena, 'oil painting')).toBe(
      'portrait, head and shoulders, A ferrywoman., She has grey hair., She wears a patched coat., oil painting',
    );
  });

  it('opens with the appearance when there is one', () => {
    expect(portraitPrompt({ ...lena, appearance: 'A wiry woman with cropped grey hair.' }, 'oil painting')).toMatch(
      /^portrait, head and shoulders, A wiry woman with cropped grey hair\., A ferrywoman\.,/,
    );
  });

  it('still makes a prompt for an entity with nothing known', () => {
    expect(portraitPrompt({ description: '', facts: [] }, 'oil painting')).toBe('portrait, head and shoulders, oil painting');
  });

  it('takes the style from the first genre tag, else a neutral one', () => {
    expect(portraitStyle(['Cozy', 'Fantasy'])).toBe('oil painting, muted colours');
    expect(portraitStyle([])).toBe('painted illustration, soft light');
  });
});

describe('queuePortraits', () => {
  it('draws one portrait per character, once, at the portrait preset with a fixed seed, and stores it', async () => {
    const calls: ImageRequest[] = [];
    const { session, images } = withImages(async (req) => (calls.push(req), new Blob(['png'])), { ...lena }, gate);
    await queuePortraits(session, new AbortController().signal);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ width: 384, height: 384, steps: 14, negativePrompt: 'text, watermark, signature, frame, caption' });
    expect(calls[0]).toMatchObject({ sampler: 'DPM++ 2M Karras', clipSkip: 2 });
    expect(calls[0]?.hires).toBeUndefined();
    expect(PORTRAIT_PX).toBe(64);
    await renderPortrait(session, lena.id);
    expect(calls[1]?.seed).toBe(calls[0]?.seed);
    expect(calls[0]?.seed).toBeLessThan(2 ** 32);
    expect(session.getSnapshot().portraitState).toEqual({});
    expect(images.size).toBe(1);
    expect(portraitOf(session, lena.id)).toBeDefined();
    await queuePortraits(session, new AbortController().signal);
    expect(calls).toHaveLength(2);
  });

  it('marks a failed render, and retries it once the server is back or after five turns', async () => {
    let up = false;
    const txt2img = vi.fn<ImageProvider['txt2img']>(async () => {
      if (!up) throw new Error('connection refused');
      return new Blob(['png']);
    });
    const { session } = withImages(txt2img, { ...lena, id: 'ent_r' });
    const images = await session.svc.imageProviderFor(session.app);
    if (images) images.health = async () => up;
    const run = () => queuePortraits(session, new AbortController().signal);
    await run();
    expect(session.getSnapshot().portraitState['ent_r']).toMatchObject({ status: 'failed', error: 'connection refused', down: true });
    await run();
    expect(txt2img).toHaveBeenCalledTimes(1);
    up = true;
    await run();
    expect(txt2img).toHaveBeenCalledTimes(2);
    expect(portraitOf(session, 'ent_r')).toBeDefined();
    expect(session.getSnapshot().portraitState).toEqual({});
  });

  it('retries a failure on a healthy server after PORTRAIT_RETRY_TURNS turns', async () => {
    const txt2img = vi.fn<ImageProvider['txt2img']>(() => Promise.reject(new Error('bad checkpoint')));
    const { session } = withImages(txt2img, { ...lena, id: 'ent_t' });
    const run = () => queuePortraits(session, new AbortController().signal);
    await run();
    expect(session.getSnapshot().portraitState['ent_t']).toMatchObject({ status: 'failed', down: false });
    for (let i = 0; i < PORTRAIT_RETRY_TURNS - 1; i++) session.log.append('continue', 'More.');
    session.emit();
    await run();
    expect(txt2img).toHaveBeenCalledTimes(1);
    session.log.append('continue', 'More.');
    session.emit();
    await run();
    expect(txt2img).toHaveBeenCalledTimes(2);
  });

  it('does nothing without an image server or with portraits off', async () => {
    const none = withImages(null, { ...lena, id: 'ent_a' });
    await queuePortraits(none.session, new AbortController().signal);
    expect(none.session.getSnapshot().error).toBeNull();
    const txt2img = vi.fn<ImageProvider['txt2img']>(async () => new Blob(['png']));
    const off = withImages(txt2img, { ...lena, id: 'ent_b' });
    off.session.updateSettings({ image: { ...off.session.adv.settings.image, portraits: false } });
    await queuePortraits(off.session, new AbortController().signal);
    expect(txt2img).not.toHaveBeenCalled();
  });

  it('stores nothing when the entity is deleted during the render', async () => {
    let session: ReturnType<typeof setup>['session'] | undefined;
    const t = withImages(async () => (entityEdits(session!).delete('ent_c'), new Blob(['png'])), { ...lena, id: 'ent_c' });
    session = t.session;
    await queuePortraits(session, new AbortController().signal);
    expect(t.images.size).toBe(0);
  });

  it('starts no render once the next turn has begun', async () => {
    const txt2img = vi.fn<ImageProvider['txt2img']>(async () => new Blob(['png']));
    const { session } = withImages(txt2img, { ...lena, id: 'ent_d' });
    const idle = new AbortController();
    idle.abort();
    await queuePortraits(session, idle.signal);
    expect(txt2img).not.toHaveBeenCalled();
  });
});

describe('one image at a time', () => {
  it('a See image and a portrait never render together', async () => {
    let inFlight = 0;
    let most = 0;
    const txt2img = vi.fn<ImageProvider['txt2img']>(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Blob(['png']);
    });
    const { session } = withImages(txt2img, { ...lena, id: 'ent_s' }, { ...lena, id: 'ent_u' });
    const portraits = queuePortraits(session, new AbortController().signal);
    session.see('a ferry at dusk');
    await portraits;
    await vi.waitFor(() => expect(txt2img).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(session.getSnapshot().pendingImages).toEqual([]));
    expect(most).toBe(1);
  });
});

describe('after a turn', () => {
  it('the idle memory run queues the portrait', async () => {
    const txt2img = vi.fn<ImageProvider['txt2img']>(async () => new Blob(['png']));
    const { session, idle } = withImages(txt2img, { ...lena, id: 'ent_g' });
    session.submit('do', 'look around');
    await settled(session);
    for (const fn of idle) fn();
    await vi.waitFor(() => expect(portraitOf(session, 'ent_g')).toBeDefined());
    expect(txt2img).toHaveBeenCalledTimes(1);
  });

  it('does not wait behind memory jobs the player is holding off by typing', async () => {
    const txt2img = vi.fn<ImageProvider['txt2img']>(async () => new Blob(['png']));
    const { session, idle } = withImages(txt2img, { ...lena, id: 'ent_h' });
    session.submit('do', 'look around');
    await settled(session);
    session.setTyping(true);
    for (const fn of idle) fn();
    await vi.waitFor(() => expect(portraitOf(session, 'ent_h')).toBeDefined());
  });
});

describe('portrait edits', () => {
  it('redraw replaces the blob; clear and delete drop it', async () => {
    const { session, images } = withImages(async () => new Blob(['png']), { ...lena, id: 'ent_e' });
    const edits = entityEdits(session);
    await edits.regeneratePortrait('ent_e');
    const first = portraitOf(session, 'ent_e');
    await edits.regeneratePortrait('ent_e');
    expect(portraitOf(session, 'ent_e')).not.toBe(first);
    expect(images.size).toBe(1);
    edits.clearPortrait('ent_e');
    expect(portraitOf(session, 'ent_e')).toBeUndefined();
    await edits.uploadPortrait('ent_e', new Blob(['jpg']));
    expect(images.size).toBe(1);
    edits.delete('ent_e');
    await vi.waitFor(() => expect(images.size).toBe(0));
  });

  it('shows a failed redraw', async () => {
    const { session } = withImages(() => Promise.reject(new Error('busy')), { ...lena, id: 'ent_f' });
    await entityEdits(session).regeneratePortrait('ent_f');
    expect(session.getSnapshot().error).toBe('Could not draw the portrait: busy');
  });
});
