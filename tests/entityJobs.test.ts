import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { extractFromPassage } from '@core/memory/extract';
import { EXTRACT_JSON_SCHEMA } from '@core/memory/extractJsonSchema';
import { appearanceOf } from '@core/memory/looks';
import { extractPrompt } from '@core/text/prompts';
import { entitiesOverdue } from '@core/memory/memoryBank';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import type { CompletionRequest } from '@core/ports';
import { MAX_ENTITIES } from '@core/schema/extraction';
import type { Adventure } from '@core/model';
import { own } from './fixtures/assertions';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

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
    const adv = adventure(18, 'You wave and mira waves back.');
    adv.entities = [mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '', facts: [] }, 0)];
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
    expect(adv.entities[0]?.facts.map((f) => f.text)).toEqual(['She waves.']);
  });

  it('makes one entity call per two written memories over both ranges and folds its reply in', async () => {
    const adv = adventure(30);
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
    expect(report).toMatchObject({ memoriesWritten: 4, entitiesTouched: 1 });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[1]?.toAction);
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    const entityReqs = reqs.filter((r) => r.prompt.includes(ENTITY_PROMPT));
    expect(entityReqs).toHaveLength(2);
    expect(entityReqs[0]).toMatchObject({
      maxTokens: 500,
      temperature: 0.2,
      slotId: 1,
      cachePrompt: false,
      jsonSchema: expect.objectContaining({ type: 'object' }),
    });
    expect(entityReqs[0]?.prompt).toContain('[0] ');
    expect(entityReqs[0]?.prompt).toContain('[11] ');
    expect(entityReqs[0]?.prompt).not.toContain('[12] ');
    expect(entityReqs[1]?.prompt).toContain('use these exact names when the passage means them): Mira');
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[3]?.toAction);
    expect(adv.entities).toHaveLength(1);
    expect(adv.entities[0]).toMatchObject({ name: 'Mira', aliases: ['the courier'], firstSeen: 11, lastSeen: 23 });
    expect(adv.entities[0]?.facts).toHaveLength(1);
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

  it('drops only the last item of the list a reply cut at maxTokens fell in', async () => {
    const adv = adventure(18, 'You wave and Mira and Odo wave back.');
    const entities =
      '{"entities": [{"name": "Mira", "kind": "character", "description": "A courier.", "facts": []}, {"name": "Odo", "kind": "character", "description": "A captain.", "facts": []}]';
    const run = async (cut: string) => {
      const provider = fakeProvider(async function* (req) {
        const entity = req.prompt.includes(ENTITY_PROMPT);
        yield { text: entity ? cut.slice(1) : 'Mira found the map.', done: true, stats: { stopReason: entity ? 'length' : 'eos' } };
      });
      return extractFromPassage('[3] You wave and Mira and Odo wave back.', none, { ...fakeDeps(adv).deps, provider });
    };
    const inEntities = await run(entities.replace('A captain.", "facts": []}]', 'A capt'));
    expect(inEntities?.entities.map((e) => e.name)).toEqual(['Mira']);
    const inSpeakers = await run(`${entities}, "speakers": [{"action": 3, "name": "Mira"}, {"action": 3, "na`);
    expect(inSpeakers?.entities.map((e) => e.name)).toEqual(['Mira', 'Odo']);
    expect(inSpeakers?.speakers).toEqual([{ action: 3, name: 'Mira' }]);
  });

  it('retries a cut entity call on the next idle run and catches up two memories per run', async () => {
    const adv = adventure(30);
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
    expect(adv.memories).toHaveLength(4);
    expect(adv.scriptState.__entitiesAt).toBeUndefined();
    await runMemoryMaintenance(adv, { ...base, provider });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[1]?.toAction);
    await runMemoryMaintenance(adv, { ...base, provider });
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[3]?.toAction);
  });

  it("reports the helper's speakers as paragraph labels for the log", async () => {
    const adv = adventure(18);
    const said = adv.actions[1];
    if (said) said.versions = ['"Hold the rope," she says.'];
    const reply = {
      entities: [{ name: 'Mira', kind: 'character', description: 'A courier.', facts: [] }],
      speakers: [{ action: 1, name: 'Mira' }],
    };
    const provider = fakeProvider(
      async function* (req) {
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? JSON.stringify(reply) : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect([...report.speakers]).toEqual([[said?.id, [{ paragraph: 0, name: 'Mira' }]]]);
  });

  it('leaves the scene to the turn read: an old reply’s scene is ignored, and none is asked', async () => {
    const adv = adventure(18);
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
    const adv = adventure(18, 'You wave and Mira, short and with a shaved head, and Tobin wave back.');
    const provider = fakeProvider(
      async function* (req) {
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? reply : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.entities.map((e) => [e.name, appearanceOf(own(e))])).toEqual([
      ['Mira', 'build: short, hair: shaved head'],
      ['Tobin', ''],
    ]);
  });

  it('neither asks for nor keeps the fields the schema dropped', async () => {
    expect(extractPrompt('[0] Mira waves.', none, false)).not.toMatch(/importance|threads|timeDelta|time of day|appearance/);
    const schema = EXTRACT_JSON_SCHEMA;
    expect(schema.required).toEqual(['entities', 'speakers']);
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

  it('waits for a second memory before the entity call', async () => {
    const adv = adventure(12);
    const { deps, calls } = fakeDeps(adv);
    expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesWritten: 1, entitiesTouched: 0 });
    expect(calls.filter((c) => c.includes(ENTITY_PROMPT))).toHaveLength(0);
    expect(adv.scriptState.__entitiesAt).toBeUndefined();
  });

  it(`keeps the first ${MAX_ENTITIES} entities of a longer reply`, async () => {
    const names = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Fay'];
    const adv = adventure(18, `You wave at ${names.join(', ')}.`);
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
    expect(adv.scriptState.__entitiesAt).toBe(adv.memories[1]?.toAction);
  });
});
