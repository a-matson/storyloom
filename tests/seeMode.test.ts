import { describe, expect, it, vi } from 'vitest';
import type { ImageProvider } from '@core/ports';
import { setup } from './fixtures/session';

const fakeImages = (txt2img: ImageProvider['txt2img']): ImageProvider => ({
  id: 'img',
  baseUrl: 'http://img.invalid',
  health: () => Promise.resolve(true),
  models: () => Promise.resolve([]),
  txt2img,
});

describe('See mode', () => {
  it('appends the caption at once, then patches the action with the stored image id', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const { session, images } = setup({ images: fakeImages(() => Promise.resolve(blob)) });
    session.see('  a lantern  ');
    // The caption is on screen before the image server answers.
    const seen = session.getSnapshot().actions.filter((a) => a.type === 'see');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.image?.prompt).toBe('a lantern');
    expect(seen[0]?.image?.imageId).toBeUndefined();
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
    await vi.waitFor(() => expect(prompts).toEqual(['a lantern', 'a lantern at dusk']));
    expect(session.getSnapshot().actions.at(-1)?.image?.prompt).toBe('a lantern at dusk');
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
});
