import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { extractFromPassage } from '@core/memory/extract';
import { EXTRACT_JSON_SCHEMA } from '@core/memory/extractJsonSchema';
import { indexAssertions } from '@core/memory/assertionIndex';
import { appearanceOf } from '@core/memory/looks';
import { extractPrompt } from '@core/text/prompts';
import { entitiesOverdue } from '@core/memory/memoryBank';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import type { CompletionRequest } from '@core/ports';
import { MAX_ENTITIES } from '@core/schema/extraction';
import type { Adventure } from '@core/model';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

/** The first entity's traits. */
const traits = (adv: Adventure) => adv.assertions.flatMap((a) => (a.kind === 'trait' && a.subject === adv.entities[0]?.id ? [a.text] : []));

const none: string[] = [];

/**
 * A new entity is kept only when two actions name it, and the fixture's text names nobody the
 * replies do: actions 3 and 4 read `text`.
 */
function adventure(actions: number, text = 'You wave and Mira waves back.'): Adventure {
  const adv = memoryAdventure(actions);
  for (const a of adv.actions.slice(3, 5)) a.versions = [text];
  return adv;
}

describe('entity extraction in memory maintenance', () => {
  it('keeps a new entity only when its passage names it, and merges a known one regardless', async () => {
    const adv = adventure(24, 'You wave and mira waves back.');
    adv.entities = [mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0)];
    const reply = {
      entities: [
        { name: 'Brass Owl', kind: 'place', description: 'Copied from the example.', facts: [] },
        { name: 'Mira', kind: 'character', description: '', facts: ['She waves.'] },
      ],
      speakers: [],
    };
    const provider = fakeProvider(
      async function* (req) {
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? JSON.stringify(reply) : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.entities.map((e) => e.name)).toEqual(['Mira']);
    expect(traits(adv)).toEqual(['She waves.']);
  });

  it('makes one entity call per three written memories over their ranges and folds its reply in', async () => {
    const adv = adventure(42);
    const reqs: CompletionRequest[] = [];
    const reply = {
      entities: [
        { name: 'Mira', kind: 'character', aliases: ['the courier'], description: 'A courier.', facts: ['She waves back.'] },
        { name: 'the map', kind: 'item', description: 'A common noun, not a name.', facts: [] },
        { name: 'The creature', kind: 'character', description: 'A role with a capitalised article.', facts: [] },
      ],
      speakers: [],
    };
    const provider = fakeProvider(
      async function* (req) {
        reqs.push(req);
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? JSON.stringify(reply) : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(report).toMatchObject({ memoriesWritten: 6, entitiesTouched: 1 });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[2]?.toAction);
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    const entityReqs = reqs.filter((r) => r.prompt.includes(ENTITY_PROMPT));
    expect(entityReqs).toHaveLength(2);
    expect(entityReqs[0]).toMatchObject({
      maxTokens: 500,
      temperature: 0.2,
      slotId: 1,
      cachePrompt: true,
      jsonSchema: expect.objectContaining({ type: 'object' }),
    });
    expect(entityReqs[0]?.prompt).toContain('[0] ');
    expect(entityReqs[0]?.prompt).toContain('[17] ');
    expect(entityReqs[0]?.prompt).not.toContain('[18] ');
    expect(entityReqs[1]?.prompt).toContain('use these exact names when the passage means them): Mira');
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[5]?.toAction);
    expect(adv.entities).toHaveLength(1);
    expect(adv.entities[0]).toMatchObject({ name: 'Mira', aliases: ['the courier'], firstSeen: 17, lastSeen: 35 });
    expect(traits(adv)).toHaveLength(1);
  });

  it('keeps the memory and the entities when the entity reply is malformed', async () => {
    const adv = adventure(18);
    const provider = fakeProvider(async function* (req) {
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? '"entities": [{"name": ' : 'Mira found the map.', done: true };
    });
    const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(report).toMatchObject({ memoriesWritten: 2, entitiesTouched: 0 });
    expect(adv.entities).toEqual([]);
  });

  it('drops only the last entity of a reply cut at maxTokens', async () => {
    const adv = adventure(18, 'You wave and Mira and Odo wave back.');
    const cut =
      '"entities": [{"name": "Mira", "kind": "character", "description": "A courier.", "facts": []}, {"name": "Odo", "kind": "character", "description": "A capt';
    const provider = fakeProvider(async function* (req) {
      const entity = req.prompt.includes(ENTITY_PROMPT);
      yield { text: entity ? cut : 'Mira found the map.', done: true, stats: { stopReason: entity ? 'length' : 'eos' } };
    });
    const reply = await extractFromPassage('[3] You wave and Mira and Odo wave back.', none, { ...fakeDeps(adv).deps, provider });
    expect(reply?.entities.map((e) => e.name)).toEqual(['Mira']);
    expect(reply?.cut).toBe(true);
  });

  it('advances past the first memory only when the reply was cut, so the rest is read again', async () => {
    const adv = adventure(30);
    let cut = true;
    const provider = fakeProvider(async function* (req) {
      const entity = req.prompt.includes(ENTITY_PROMPT);
      yield { text: entity ? '"entities": []}' : 'Mira found the map.', done: true, stats: { stopReason: entity && cut ? 'length' : 'eos' } };
    });
    const base = fakeDeps(adv).deps;
    await runMemoryMaintenance(adv, { ...base, provider });
    expect(adv.memories).toHaveLength(4);
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[0]?.toAction);
    cut = false;
    await runMemoryMaintenance(adv, { ...base, provider });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[3]?.toAction);
  });

  it('retries a cut entity call on the next idle run and catches up three memories per run', async () => {
    const adv = adventure(42);
    let cutNext = true;
    const cc = new AbortController();
    const provider = fakeProvider(async function* (req) {
      const entity = req.prompt.includes(ENTITY_PROMPT);
      if (entity && cutNext) {
        cutNext = false;
        cc.abort();
      }
      yield { text: entity ? '{"importance": 1, "entities": []}' : 'Mira found the map.', done: true };
    });
    const base = fakeDeps(adv).deps;
    await runMemoryMaintenance(adv, { ...base, provider, signal: cc.signal, cancel: cc.signal });
    expect(adv.memories).toHaveLength(6);
    expect(adv.scriptState.__entitiesAt).toBeUndefined();
    await runMemoryMaintenance(adv, { ...base, provider });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[2]?.toAction);
    await runMemoryMaintenance(adv, { ...base, provider });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[5]?.toAction);
  });

  it('leaves the scene to the turn read: an old reply’s scene is ignored, and none is asked', async () => {
    const adv = adventure(24);
    const reqs: CompletionRequest[] = [];
    const reply = { scene: { location: 'the mill', present: ['Mira'] }, entities: [], speakers: [] };
    const provider = fakeProvider(
      async function* (req) {
        reqs.push(req);
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? JSON.stringify(reply) : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.plot.scene).toBeUndefined();
    const schema = reqs.find((r) => r.jsonSchema)?.jsonSchema;
    expect(JSON.stringify(schema)).not.toMatch(/timeDelta|timeOfDay|scene/);
  });

  it('stores the keyed looks a reply gives, and none when the reply has none', async () => {
    const reply =
      '{"entities": [{"name": "Mira", "kind": "character", "description": "A courier.", "looks": {"build": "short", "hair": "shaved head"}, "facts": []}, ' +
      '{"name": "Tobin", "kind": "character", "description": "A miller.", "facts": []}], "speakers": []}';
    const adv = adventure(24, 'You wave and Mira, short and with a shaved head, and Tobin wave back.');
    const provider = fakeProvider(
      async function* (req) {
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? reply : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.entities.map((e) => [e.name, appearanceOf(indexAssertions(adv.assertions).of(e.id))])).toEqual([
      ['Mira', 'build: short, hair: shaved head'],
      ['Tobin', ''],
    ]);
  });

  it('neither asks for nor keeps the fields the schema dropped', async () => {
    expect(extractPrompt('[0] Mira waves.', none, false)).not.toMatch(/importance|threads|timeDelta|time of day|appearance/);
    const schema = EXTRACT_JSON_SCHEMA;
    expect(extractPrompt('[0] Mira waves.', none, false)).not.toMatch(/speakers/);
    expect(schema.required).toEqual(['entities']);
    // Required, every entity wrote looks and the reply hit the token cap.
    expect(schema).toMatchObject({ properties: { entities: { items: { required: expect.not.arrayContaining(['looks']) } } } });
    // Uncapped, one description ran past the whole reply.
    expect(schema).toMatchObject({ properties: { entities: { items: { properties: { description: { maxLength: 120 } } } } } });
    // `timeDelta` is what a reply from before the clock was dropped still carries.
    const stray =
      '{"importance": 4, "timeDelta": {"days": 0, "parts": 0}, "entities": [{"name": "Mira", "kind": "character", "description": "A courier.", "facts": []}], "speakers": [], "threads": ["x"]}';
    const provider = fakeProvider(async function* () {
      yield { text: stray.slice(1), done: true };
    });
    const r = await extractFromPassage('[0] Mira waves.', none, { ...fakeDeps(adventure(1)).deps, provider });
    expect(r?.entities.map((e) => e.name)).toEqual(['Mira']);
    expect(r).not.toHaveProperty('importance');
    expect(r).not.toHaveProperty('threads');
  });

  it('waits for a third memory before the entity call', async () => {
    const adv = adventure(18);
    const { deps, calls } = fakeDeps(adv);
    expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesWritten: 2, entitiesTouched: 0 });
    expect(calls.filter((c) => c.includes(ENTITY_PROMPT))).toHaveLength(0);
    expect(adv.scriptState.__entitiesAt).toBeUndefined();
  });

  it(`keeps the first ${MAX_ENTITIES} entities of a longer reply`, async () => {
    const names = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Fay'];
    const adv = adventure(24, `You wave at ${names.join(', ')}.`);
    const reply = { entities: names.map((name) => ({ name, kind: 'character', description: '', facts: [] })), speakers: [] };
    const provider = fakeProvider(async function* (req) {
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? JSON.stringify(reply).slice(1) : 'Mira found the map.', done: true };
    });
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.entities.map((e) => e.name)).toEqual(names.slice(0, MAX_ENTITIES));
  });

  it('runs an overdue backlog after the idle signal fires, so fast play cannot starve it', async () => {
    const adv = adventure(30);
    const cc = new AbortController();
    const provider = fakeProvider(async function* (req) {
      if (req.prompt.includes(ENTITY_PROMPT)) cc.abort();
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? '{"importance": 1, "entities": []}' : 'Mira found the map.', done: true };
    });
    const base = fakeDeps(adv).deps;
    await runMemoryMaintenance(adv, { ...base, provider, signal: cc.signal, cancel: cc.signal });
    expect(entitiesOverdue(adv)).toBe(true);
    await runMemoryMaintenance(adv, { ...base, provider, signal: AbortSignal.abort() });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[2]?.toAction);
  });
});
