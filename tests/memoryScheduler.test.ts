import { describe, expect, it, vi } from 'vitest';
import { MemoryScheduler } from '@app/session/memoryScheduler';
import { entitiesOverdue } from '@core/memory';
import { mergeEntity } from '@core/memory/entities';
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
      flag: () => {},
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

  const host = (adv: Adventure, provider: Provider, flag: (c: { actionId: string; fact: string } | null) => void = () => {}) => {
    const embedder: Embedder = { id: 'e', dimensions: 2, embed: (t) => Promise.resolve(t.map(() => [1, 0])) };
    return {
      adventure: () => adv,
      helperModel: () => Promise.resolve({ provider, template: adv.settings.template }),
      embedder: () => Promise.resolve(embedder),
      changed: () => {},
      annotate: () => {},
      portraits: () => Promise.resolve(),
      flag,
    };
  };

  describe('contradiction check', () => {
    /** An adventure whose last output names a canon entity, and a helper that logs each call's kind. */
    function setup(check: boolean) {
      const adv = memoryAdventure(19); // odd, so the last action is AI output
      adv.settings.memory = { ...adv.settings.memory, contradictionCheck: check };
      adv.entities = [
        { ...mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '', facts: [] }, 0), canon: true, description: 'Mira is bald.' },
      ];
      const last = adv.actions.at(-1);
      if (last) last.versions = ['Mira shakes out her long hair.'];
      const calls: string[] = [];
      const provider = fakeProvider(
        async function* (req) {
          const kind = req.prompt.includes(CHECK_PROMPT) ? 'check' : req.prompt.includes(ENTITY_PROMPT) ? 'entity' : 'memory';
          calls.push(kind);
          const text = { check: '{"contradicts": true, "fact": "Mira is bald."}', entity: '{"importance": 1, "entities": []}', memory: 'Mira found the map.' }[
            kind
          ];
          yield { text, done: true };
        },
        false,
        true,
      );
      const flags: ({ actionId: string; fact: string } | null)[] = [];
      const scheduler = new MemoryScheduler(host(adv, provider, (c) => flags.push(c)));
      return { adv, calls, flags, scheduler };
    }
    const CHECK_PROMPT = 'Established facts:';

    it('makes no check call when the setting is off', async () => {
      const { adv, calls, scheduler } = setup(false);
      scheduler.start(new AbortController().signal);
      await vi.waitFor(() => expect(adv.memories.length).toBeGreaterThan(0));
      expect(calls).not.toContain('check');
    });

    it('checks the last output before maintenance and flags it', async () => {
      const { adv, calls, flags, scheduler } = setup(true);
      scheduler.start(new AbortController().signal);
      await vi.waitFor(() => expect(adv.memories.length).toBeGreaterThan(0));
      expect(calls[0]).toBe('check');
      expect(flags).toEqual([{ actionId: adv.actions.at(-1)?.id, fact: 'Mira: Mira is bald.' }]);
    });

    it('skips the check and the rest once the idle period ended', async () => {
      const { calls, flags, scheduler } = setup(true);
      const idle = new AbortController();
      idle.abort();
      scheduler.start(idle.signal);
      await new Promise((r) => setTimeout(r, 20));
      expect(calls).toEqual([]);
      expect(flags).toEqual([]);
    });
  });

  describe('introductions', () => {
    /** The last output names a new character; the helper answers the introduction call with her card. */
    function setup() {
      const adv = memoryAdventure(19);
      adv.settings.memory = { ...adv.settings.memory, introductions: true };
      adv.scriptState = { ...adv.scriptState, __introducedAt: 0 };
      const last = adv.actions.at(-1);
      if (last) last.versions = ['You meet Tamsin at the ferry.'];
      const calls: string[] = [];
      let release = () => {};
      const held = new Promise<void>((r) => (release = r));
      const provider = fakeProvider(
        async function* (req, signal) {
          const kind = req.prompt.includes('New here:') ? 'introduce' : req.prompt.includes(ENTITY_PROMPT) ? 'entity' : 'memory';
          calls.push(kind);
          if (kind === 'introduce') await Promise.race([held, new Promise((r) => signal?.addEventListener('abort', r))]);
          if (signal?.aborted) return;
          const card = { scene: {}, entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', facts: [] }], speakers: [] };
          yield { text: kind === 'memory' ? 'Mira found the map.' : JSON.stringify(kind === 'introduce' ? card : { entities: [] }), done: true };
        },
        false,
        true,
      );
      return { adv, calls, release, scheduler: new MemoryScheduler(host(adv, provider)) };
    }

    it('runs before the memory run, and typing does not cut it', async () => {
      const { adv, calls, release, scheduler } = setup();
      scheduler.start(new AbortController().signal);
      await vi.waitFor(() => expect(calls).toEqual(['introduce']));
      scheduler.setTyping(true);
      release();
      await vi.waitFor(() => expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin']));
      scheduler.setTyping(false);
      await vi.waitFor(() => expect(calls).toContain('memory'));
      expect(calls[0]).toBe('introduce');
    });

    it('outlives the next turn, which starts no second call beside it', async () => {
      const { adv, calls, release, scheduler } = setup();
      const idle = new AbortController();
      scheduler.start(idle.signal);
      await vi.waitFor(() => expect(calls).toEqual(['introduce']));
      idle.abort();
      scheduler.start(new AbortController().signal);
      await new Promise((r) => setTimeout(r, 20));
      expect(calls).toEqual(['introduce']);
      release();
      await vi.waitFor(() => expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin']));
      // The re-run finds the same turn already read: no second call.
      await vi.waitFor(() => expect(calls).toContain('memory'));
      expect(calls.filter((c) => c === 'introduce')).toHaveLength(1);
    });

    it('reads the opening on open', async () => {
      const { adv, release, scheduler } = setup();
      adv.scriptState = { ...adv.scriptState, __introducedAt: undefined };
      scheduler.open();
      release();
      await vi.waitFor(() => expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin']));
    });
  });

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
