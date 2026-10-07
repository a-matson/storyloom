import { describe, expect, it, vi } from 'vitest';
import { MemoryScheduler } from '@app/session/memoryScheduler';
import { entitiesOverdue } from '@core/memory';
import type { Adventure } from '@core/model';
import type { Embedder, Provider } from '@core/ports';
import { ENTITY_PROMPT, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

describe('MemoryScheduler', () => {
  it('keeps one maintenance run at a time when an overdue run outlives its idle period', async () => {
    const adv = memoryAdventure(30);
    let open = 0;
    let most = 0;
    let calls = 0;
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const provider = fakeProvider(async function* (req) {
      most = Math.max(most, ++open);
      // The first call holds slot 1 until the next idle period has started.
      if (++calls === 1) await held;
      open--;
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? '{"importance": 1, "entities": []}' : 'Mira found the map.', done: true };
    });
    const embedder: Embedder = { id: 'e', dimensions: 2, embed: (t) => Promise.resolve(t.map(() => [1, 0])) };
    const scheduler = new MemoryScheduler({
      adventure: () => adv,
      helperModel: () => Promise.resolve({ provider, template: adv.settings.template }),
      embedder: () => Promise.resolve(embedder),
      changed: () => {},
      annotate: () => {},
      portraits: () => Promise.resolve(),
    });
    // Two turns in quick succession: each new idle period starts while the last run still holds slot 1.
    const first = new AbortController();
    scheduler.start(first.signal);
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0));
    first.abort();
    scheduler.start(new AbortController().signal);
    await new Promise((r) => setTimeout(r, 20));
    release();
    await vi.waitFor(() => expect(adv.scriptState.__entitiesAt).toBe(adv.memories.at(-1)?.toAction));
    expect(most).toBe(1);
  });

  const host = (adv: Adventure, provider: Provider) => {
    const embedder: Embedder = { id: 'e', dimensions: 2, embed: (t) => Promise.resolve(t.map(() => [1, 0])) };
    return {
      adventure: () => adv,
      helperModel: () => Promise.resolve({ provider, template: adv.settings.template }),
      embedder: () => Promise.resolve(embedder),
      changed: () => {},
      annotate: () => {},
      portraits: () => Promise.resolve(),
    };
  };

  // An import starts with no memories, so one idle run writes them all; the entity calls must not wait a turn per batch.
  it('drains an entity backlog within one idle period', async () => {
    const adv = memoryAdventure(80);
    let entityCalls = 0;
    const provider = fakeProvider(async function* (req) {
      if (req.prompt.includes(ENTITY_PROMPT)) entityCalls++;
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? '{"importance": 1, "entities": []}' : 'Mira found the map.', done: true };
    });
    new MemoryScheduler(host(adv, provider)).start(new AbortController().signal);
    await vi.waitFor(() => expect(adv.memories.length).toBeGreaterThan(4));
    await vi.waitFor(() => expect(entitiesOverdue(adv)).toBe(false));
    expect(entityCalls).toBeGreaterThan(2);
  });

  it('does not re-run while the helper makes no progress', async () => {
    const adv = memoryAdventure(80);
    let calls = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // oxlint-disable-next-line require-yield -- a helper that fails before its first token
    const provider = fakeProvider(async function* () {
      calls++;
      throw new Error('down');
    });
    new MemoryScheduler(host(adv, provider)).start(new AbortController().signal);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
    warn.mockRestore();
  });
});
