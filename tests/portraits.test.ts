import { describe, expect, it, vi } from 'vitest';
import { entityEdits } from '@app/session/entities';
import { queuePortraits } from '@app/session/portraits';
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
  const images: ImageProvider | undefined = txt2img
    ? { id: 'img', baseUrl: 'http://img.invalid', health: async () => true, models: async () => [], txt2img }
    : undefined;
  return setup({ adventure, ...(images && { images }) });
}

const portraitOf = (s: ReturnType<typeof setup>['session'], id: string) => s.getSnapshot().adventure.entities.find((e) => e.id === id)?.portraitId;

describe('portraitPrompt', () => {
  it('carries the description, at most three appearance facts and the style', () => {
    expect(portraitPrompt(lena, 'oil painting')).toBe(
      'portrait, head and shoulders, A ferrywoman., She has grey hair., She wears a patched coat., A scar runs over her chin., oil painting',
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
  it('draws one portrait per character, once, at 512² and stores it', async () => {
    const calls: ImageRequest[] = [];
    const { session, images } = withImages(async (req) => (calls.push(req), new Blob(['png'])), { ...lena }, gate);
    await queuePortraits(session, new AbortController().signal);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ width: 512, height: 512, negativePrompt: 'text, watermark, signature, frame, caption' });
    expect(images.size).toBe(1);
    expect(portraitOf(session, lena.id)).toBeDefined();
    await queuePortraits(session, new AbortController().signal);
    expect(calls).toHaveLength(1);
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
