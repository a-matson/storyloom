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

  it('asks for a prompt instead of appending an empty action', () => {
    const { session } = setup({ images: fakeImages(() => Promise.reject(new Error('never called'))) });
    session.see('   ');
    expect(session.getSnapshot().actions.some((a) => a.type === 'see')).toBe(false);
    expect(session.getSnapshot().error).toContain('Describe what you want to see');
  });
});
