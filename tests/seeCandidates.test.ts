import { describe, expect, it, vi } from 'vitest';
import { blobIdsOf, chosen, ownedBlobIds, rendersOf, withCandidate } from '@core/image';
import { fakeImages } from './fixtures/images';
import { setup } from './fixtures/session';

type Session = ReturnType<typeof setup>['session'];

/** A See rendered twice: `[first, second]` are its candidates. */
async function twoRenders(session: Session) {
  session.see('a lantern');
  await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBeDefined());
  const action = session.getSnapshot().actions.at(-1);
  session.regenerateSee(action?.id ?? '');
  await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.candidates).toHaveLength(2));
  const ids = blobIdsOf(session.getSnapshot().actions.at(-1)?.image ?? { prompt: '' });
  return { id: action?.id ?? '', first: ids[0] ?? '', second: ids[1] ?? '' };
}

describe('See candidates in a session', () => {
  it('choosing deletes the other blobs and clears candidates, and a reference on a dropped one goes too', async () => {
    let n = 0;
    const { session, images } = setup({ images: fakeImages(() => Promise.resolve(new Blob([`png${++n}`]))) });
    const { id, first, second } = await twoRenders(session);
    const adv = session.getSnapshot().adventure;
    const base = { kind: 'character' as const, description: '', aliases: [], relations: [], firstSeen: 0, lastSeen: 0 };
    adv.entities.push({ ...base, id: 'ent_x', name: 'X', referenceImageId: second });
    session.chooseSee(id, first);
    await vi.waitFor(() => expect(session.getSnapshot().actions.at(-1)?.image?.candidates).toBeUndefined());
    expect(session.getSnapshot().actions.at(-1)?.image?.imageId).toBe(first);
    await vi.waitFor(() => expect(images.has(`${adv.id}|${second}`)).toBe(false));
    expect(images.has(`${adv.id}|${first}`)).toBe(true);
    expect(session.getSnapshot().adventure.entities.find((e) => e.id === 'ent_x')?.referenceImageId).toBeUndefined();
  });

  it('erase drops every candidate’s blob', async () => {
    const { session, images } = setup({ images: fakeImages(() => Promise.resolve(new Blob(['png']))) });
    const { id } = await twoRenders(session);
    session.eraseTo(id);
    await vi.waitFor(() => expect(images.size).toBe(0));
  });

  it('an erase that drops an unborn entity deletes its portrait and sheet blobs', async () => {
    const { session, images } = setup({ images: fakeImages(() => Promise.resolve(new Blob(['png']))) });
    const { id } = await twoRenders(session);
    const adv = session.getSnapshot().adventure;
    const at = adv.actions.length - 1;
    const base = { kind: 'character' as const, description: '', aliases: [], relations: [], firstSeen: at, lastSeen: at };
    adv.entities.push({ ...base, id: 'ent_u', name: 'U', portraitId: 'img_p', sheetImageId: 'img_s' });
    for (const b of ['img_p', 'img_s']) images.set(`${adv.id}|${b}`, new Blob(['png']));
    session.eraseTo(id);
    await vi.waitFor(() => expect(images.size).toBe(0));
  });
});

const shown = { imageId: 'img_a', prompt: 'a lantern', brief: 'lantern', seed: 7 };

describe('See candidates', () => {
  it('keeps a first render plain', () => {
    expect(withCandidate({ prompt: 'p' }, { prompt: 'p' }, 'img_a')).toEqual({ image: { prompt: 'p', imageId: 'img_a' }, dropped: [] });
  });

  it('seeds the old render and appends the new one as shown', () => {
    const pending = { prompt: 'a boat', candidates: rendersOf(shown) };
    const { image, dropped } = withCandidate(pending, pending, 'img_b');
    expect(dropped).toEqual([]);
    expect(image).toMatchObject({ imageId: 'img_b', prompt: 'a boat' });
    expect(image.candidates).toEqual([
      { imageId: 'img_a', prompt: 'a lantern', brief: 'lantern', seed: 7 },
      { imageId: 'img_b', prompt: 'a boat' },
    ]);
  });

  it('drops the oldest past the cap', () => {
    let image = withCandidate(shown, { prompt: 'p0' }, 'img_0').image;
    const dropped: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const r = withCandidate(image, { prompt: `p${i}` }, `img_${i}`);
      image = r.image;
      dropped.push(...r.dropped);
    }
    expect(dropped).toEqual(['img_a']);
    expect(blobIdsOf(image)).toEqual(['img_0', 'img_1', 'img_2', 'img_3', 'img_4', 'img_5', 'img_6', 'img_7']);
  });

  it('keeps the chosen one, drops the rest, removes candidates', () => {
    const { image } = withCandidate({ prompt: 'b', candidates: rendersOf(shown) }, { prompt: 'b', model: 'm' }, 'img_b');
    expect(chosen(image, 'img_a')).toEqual({
      image: { imageId: 'img_a', prompt: 'a lantern', brief: 'lantern', seed: 7, model: 'm' },
      dropped: ['img_b'],
    });
    expect(chosen(image, 'img_x')).toBeUndefined();
  });

  it('lists every blob once', () => {
    const { image } = withCandidate({ prompt: 'b', candidates: rendersOf(shown) }, { prompt: 'b' }, 'img_b');
    expect(blobIdsOf(image)).toEqual(['img_a', 'img_b']);
    expect(blobIdsOf(shown)).toEqual(['img_a']);
    expect(blobIdsOf({ prompt: 'p' })).toEqual([]);
  });

  it('ownedBlobIds lists see renders and candidates, portraits, sheets and the cover, not references', () => {
    const { image } = withCandidate({ prompt: 'b', candidates: rendersOf(shown) }, { prompt: 'b' }, 'img_b');
    const base = { kind: 'character' as const, description: '', aliases: [], relations: [], firstSeen: 0, lastSeen: 0 };
    const owned = ownedBlobIds({
      actions: [{ id: 'act_1', type: 'see', versions: [''], active: 0, createdAt: 0, image }],
      entities: [{ ...base, id: 'ent_a', name: 'A', portraitId: 'img_p', sheetImageId: 'img_s', referenceImageId: 'img_r' }],
      coverId: 'img_c',
    });
    expect([...owned].toSorted()).toEqual(['img_a', 'img_b', 'img_c', 'img_p', 'img_s']);
  });
});
