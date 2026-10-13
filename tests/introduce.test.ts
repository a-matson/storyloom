import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { candidateNames } from '@core/memory/fold';
import type { HelperCallLog } from '@core/memory';
import { introduce } from '@core/memory/introduce';
import { hashPrompt } from '@core/trace';
import { appearanceOf } from '@core/memory/looks';
import type { Adventure } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { ENTITY_PROMPT, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

describe('candidateNames', () => {
  it('keeps a mid-sentence capital and drops one only at a sentence start', () => {
    expect(candidateNames('You meet Tamsin at the gate. Lanterns sway.', [])).toEqual(['Tamsin']);
    expect(candidateNames('Brannoch waits. You nod to Brannoch.', [])).toEqual(['Brannoch']);
  });

  it('skips known names and aliases, the stop list and a leading stop word', () => {
    const text = 'Then Mira waves, and you see the Courier and Old Brannoch. When Night falls, They wait.';
    expect(candidateNames(text, ['mira', 'the courier', 'Courier'])).toEqual(['Old Brannoch']);
    expect(candidateNames('Rain falls. Then Oriel speaks.', [])).toEqual(['Oriel']);
  });

  it('dedupes', () => {
    expect(candidateNames('You greet Tamsin, then Tamsin again.', [])).toEqual(['Tamsin']);
  });
});

describe('introduce', () => {
  const reply = { scene: {}, entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', facts: [] }], speakers: [] };

  function setup(output: string, answer: object = reply) {
    const adv: Adventure = memoryAdventure(19);
    adv.settings.memory = { ...adv.settings.memory, introductions: true };
    const last = adv.actions.at(-1);
    if (last) last.versions = [output];
    const reqs: CompletionRequest[] = [];
    const provider = fakeProvider(
      async function* (req) {
        reqs.push(req);
        yield { text: JSON.stringify(answer), done: true };
      },
      false,
      true,
    );
    return { adv, reqs, deps: { provider, template: adv.settings.template } };
  }

  it('logs the turn read with its timing and hash, and sends the JSON sampling', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    const cuts = { cutCalls: 0, finishedPastCut: 0, calls: [] as HelperCallLog[] };
    await introduce(adv, { ...deps, cuts });
    expect(reqs[0]).toMatchObject({ repeatLastN: 256, presencePenalty: 0.3 });
    expect(cuts.calls).toEqual([expect.objectContaining({ job: 'entity', cut: false, accepted: 1, promptHash: hashPrompt(reqs[0]?.prompt ?? '') })]);
    expect(cuts.calls[0]?.ms).toBeGreaterThanOrEqual(0);
  });

  it('reads the opening once, then only the last two actions when a new name appears', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    await introduce(adv, deps);
    expect(reqs).toHaveLength(1);
    // The opening is capped at one memory span.
    const n = adv.actions.length;
    expect(reqs[0]?.prompt).toContain(`[${n - 6}]`);
    expect(reqs[0]?.prompt).not.toContain(`[${n - 7}]`);
    expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin']);
    expect(adv.scriptState.__introducedAt).toBe(n);

    adv.actions.push(
      { id: 'p', type: 'do', versions: ['You wave.'], active: 0, createdAt: n },
      { id: 'o', type: 'continue', versions: ['Tamsin points at Old Brannoch.'], active: 0, createdAt: n + 1 },
    );
    await introduce(adv, deps);
    expect(reqs).toHaveLength(2);
    expect(reqs[1]?.prompt).toContain('New here: Old Brannoch.');
    expect(reqs[1]?.prompt).not.toContain(ENTITY_PROMPT);
    expect(reqs[1]?.prompt).toContain(`[${n}] `);
    expect(reqs[1]?.prompt).toContain(`[${n + 1}] `);
    expect(reqs[1]?.prompt).not.toContain(`[${n - 1}]`);
  });

  it('asks a short reply: the scene first, then new cards, no facts or speakers', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    await introduce(adv, deps);
    expect(reqs[0]?.maxTokens).toBeLessThanOrEqual(200);
    expect(reqs[0]?.jsonSchema).toMatchObject({ required: ['scene', 'entities'] });
    expect(JSON.stringify(reqs[0]?.jsonSchema)).not.toMatch(/speakers|facts/);
    // The fixture reply carries facts the short shape drops.
    expect(adv.entities[0]?.facts).toEqual([]);
  });

  it('makes no call without a new name, nor twice for the same text, and re-runs for a retried one', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    adv.entities = [mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '', facts: [] }, 0)];
    // The previous turn's call finished.
    const before = { ...adv.scriptState, __introducedAt: adv.actions.length - 2 };
    adv.scriptState = before;
    await introduce(adv, deps);
    expect(reqs).toHaveLength(0);

    const last = adv.actions.at(-1);
    if (!last) throw new Error('no actions');
    last.versions = ['You meet Oriel at the ferry.'];
    adv.scriptState = before;
    await introduce(adv, deps);
    await introduce(adv, deps);
    expect(reqs).toHaveLength(1);

    last.versions.push('You meet Corwin at the ferry.');
    last.active = 1;
    await introduce(adv, deps);
    expect(reqs).toHaveLength(2);
  });

  it('keeps keyed looks, minus one that says there is none', async () => {
    const looks = {
      ...reply,
      entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', looks: { build: 'tall', hair: 'Not described in the passage.' } }],
    };
    const { adv, deps } = setup('You meet Tamsin, tall and lean, at the ferry.', looks);
    await introduce(adv, deps);
    expect(adv.entities[0] && appearanceOf(adv.entities[0])).toBe('build: tall');
  });

  it('reads from the last finished call when the turns between were cut', async () => {
    const { adv, reqs, deps } = setup('You meet Oriel at the ferry.');
    const n = adv.actions.length;
    adv.scriptState = { ...adv.scriptState, __introducedAt: n - 4 };
    await introduce(adv, deps);
    expect(reqs[0]?.prompt).toContain(`[${n - 4}] `);
    expect(reqs[0]?.prompt).not.toContain(`[${n - 5}] `);
  });

  it('does nothing when both settings are off', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    adv.settings.memory = { ...adv.settings.memory, introductions: false };
    await introduce(adv, deps);
    expect(reqs).toHaveLength(0);
  });

  describe('the scene', () => {
    const at = { moved: true, location: 'the ferry', present: ['Tamsin'], left: [], weather: 'fog' };
    const tamsin = () => ({ ...mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '', facts: [] }, 0), aliases: ['the ferrywoman'] });
    function sceneOnly(output: string, scene: object) {
      const s = setup(output, { scene });
      s.adv.entities = [tamsin()];
      s.adv.settings.memory = { ...s.adv.settings.memory, introductions: false, sceneEachTurn: true };
      return s;
    }

    it('is read on a turn with no new name: a scene-only call, then the scene moves and is logged', async () => {
      const { adv, reqs, deps } = sceneOnly('You wait at the ferry.', at);
      const n = adv.actions.length;
      expect(await introduce(adv, deps)).toMatchObject({ touched: 1, sceneUpdated: true });
      expect(reqs).toHaveLength(1);
      expect(reqs[0]?.maxTokens).toBe(80);
      expect(reqs[0]?.prompt).not.toContain('New here:');
      expect(JSON.stringify(reqs[0]?.jsonSchema)).not.toContain('entities');
      expect(adv.plot.scene).toMatchObject({ location: 'the ferry', present: ['Tamsin'], weather: 'fog', since: n - 1, sourceId: adv.actions.at(-1)?.id });
      expect(adv.plot.sceneLog).toEqual([{ at: n - 1, location: 'the ferry' }]);
      // The first place has no previous one to be part of.
      expect(adv.entities.find((e) => e.kind === 'place')).toMatchObject({ name: 'the ferry', firstSeen: n - 1 });
      expect(adv.scriptState.__placeAsk).toBeUndefined();
    });

    it('asks the cast as an enum with aliases, `nobody` when there is none, and tells the previous scene', async () => {
      const { adv, reqs, deps } = sceneOnly('You wait at the ferry.', at);
      adv.plot.scene = { location: 'the ferry', present: ['Tamsin'] };
      await introduce(adv, deps);
      const schema = JSON.stringify(reqs[0]?.jsonSchema);
      expect(schema).toContain('"enum":["Tamsin","the ferrywoman"]');
      expect(schema).toContain('"required":["moved","location","present","left","weather"]');
      expect(reqs[0]?.prompt).toContain('Previous scene: location "the ferry", present: Tamsin. Known characters: Tamsin, the ferrywoman.');
      expect(reqs[0]?.prompt).toContain('asleep or unconscious still counts; gone to another room does not');

      const empty = sceneOnly('You wait at the ferry.', at);
      empty.adv.entities = [];
      await introduce(empty.adv, empty.deps);
      expect(JSON.stringify(empty.reqs[0]?.jsonSchema)).toContain('"enum":["nobody"]');
      expect(empty.reqs[0]?.prompt).toContain('Previous scene: not known yet. Known characters: none yet.');
    });

    it('resolves an alias to the character’s name', async () => {
      const { adv, deps } = sceneOnly('You wait at the ferry.', { ...at, present: ['the ferrywoman'] });
      await introduce(adv, deps);
      expect(adv.plot.scene?.present).toEqual(['Tamsin']);
    });

    it('makes a place card for an unknown location and asks whether it is inside the previous place', async () => {
      const { adv, deps } = sceneOnly('You climb to the loft.', { ...at, location: 'the loft' });
      const ferry = mergeEntity(undefined, { name: 'the ferry', kind: 'place', description: '', facts: [] }, 0);
      adv.entities.push(ferry);
      adv.plot.scene = { location: 'the ferry', present: [] };
      await introduce(adv, deps);
      expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin', 'the ferry', 'the loft']);
      expect(adv.scriptState.__placeAsk).toEqual({ place: 'the loft', inside: 'the ferry' });
    });

    it('comes with the cards when there are new names, which it resolves to', async () => {
      const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.', { ...reply, scene: at });
      adv.settings.memory = { ...adv.settings.memory, sceneEachTurn: true };
      await introduce(adv, deps);
      expect(reqs).toHaveLength(1);
      // New names join the cast: one met this turn can be there.
      expect(JSON.stringify(reqs[0]?.jsonSchema)).toMatch(/"present":\{[^}]*"enum":\[[^\]]*"Tamsin"/);
      expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin', 'the ferry']);
      expect(adv.plot.scene?.present).toEqual(['Tamsin']);
    });

    it('is not touched by the turn read when its setting is off', async () => {
      const { adv, deps } = setup('You meet Tamsin at the ferry.', { ...reply, scene: at });
      await introduce(adv, deps);
      expect(adv.plot.scene).toBeUndefined();
    });
  });

  it('leaves the marker unset when the call was cut', async () => {
    const { adv, deps } = setup('You meet Tamsin at the ferry.');
    const cancel = new AbortController();
    cancel.abort();
    await expect(introduce(adv, { ...deps, cancel: cancel.signal })).rejects.toThrow('aborted');
    expect(adv.scriptState.__introducedAt).toBeUndefined();
  });
});
