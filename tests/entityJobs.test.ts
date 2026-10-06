import { describe, expect, it } from 'vitest';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import type { CompletionRequest } from '@core/ports';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure as adventure } from './fixtures/memoryJobs';

describe('entity extraction in memory maintenance', () => {
  it('makes exactly one entity call per written memory and folds its reply in', async () => {
    const adv = adventure(18);
    const reqs: CompletionRequest[] = [];
    const reply = {
      importance: 3,
      entities: [
        { name: 'Mira', kind: 'character', aliases: ['the courier'], description: 'A courier.', facts: ['She found the map.'] },
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
    const entityReqs = reqs.filter((r) => r.prompt.includes(ENTITY_PROMPT));
    expect(report).toMatchObject({ memoriesWritten: 2, entitiesTouched: 2 });
    expect(entityReqs).toHaveLength(2);
    expect(entityReqs[0]).toMatchObject({
      maxTokens: 500,
      temperature: 0.2,
      slotId: 1,
      cachePrompt: false,
      jsonSchema: expect.objectContaining({ type: 'object' }),
    });
    expect(entityReqs[0]?.prompt).toContain('[0] ');
    expect(entityReqs[1]?.prompt).toContain('use these exact names when the passage means them): Mira');
    expect(adv.entities).toHaveLength(1);
    expect(adv.entities[0]).toMatchObject({ name: 'Mira', aliases: ['the courier'], firstSeen: 5, lastSeen: 11 });
    expect(adv.entities[0]?.facts).toHaveLength(1);
  });

  it('keeps the memory and the entities when the entity reply is malformed', async () => {
    const adv = adventure(12);
    const provider = fakeProvider(async function* (req) {
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? '"entities": [{"name": ' : 'Mira found the map.', done: true };
    });
    const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(report).toMatchObject({ memoriesWritten: 1, entitiesTouched: 0 });
    expect(adv.entities).toEqual([]);
  });

  it('keeps the whole entities of a reply cut at maxTokens and drops the cut one', async () => {
    const adv = adventure(12);
    const cut =
      '{"importance": 2, "entities": [{"name": "Mira", "kind": "character", "description": "A courier.", "facts": []}, {"name": "Odo", "kind": "character", "description": "A captain.", "facts": ["He i';
    const provider = fakeProvider(async function* (req) {
      const entity = req.prompt.includes(ENTITY_PROMPT);
      yield { text: entity ? cut.slice(1) : 'Mira found the map.', done: true, stats: { stopReason: entity ? 'length' : 'eos' } };
    });
    expect(await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider })).toMatchObject({ entitiesTouched: 1 });
    expect(adv.entities.map((e) => e.name)).toEqual(['Mira']);
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
    const adv = adventure(12);
    const said = adv.actions[1];
    if (said) said.versions = ['"Hold the rope," she says.'];
    const reply = {
      importance: 2,
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

  it('moves the scene from the same call: the first reply starts the clock, the next one advances it', async () => {
    const adv = adventure(18);
    const reqs: CompletionRequest[] = [];
    const reply = {
      importance: 2,
      timeDelta: { parts: 1 },
      scene: { location: 'the mill', present: ['Mira'], timeOfDay: 'evening' },
      entities: [],
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
    expect(reqs.filter((r) => r.prompt.includes(ENTITY_PROMPT))).toHaveLength(2);
    expect(report.sceneUpdated).toBe(true);
    expect(adv.plot.scene).toEqual({ location: 'the mill', present: ['Mira'], time: { day: 1, part: 'night' } });
  });

  it('skips the entity call once the idle signal fires', async () => {
    const adv = adventure(12);
    const { deps, calls } = fakeDeps(adv, { abortAfter: 1 });
    expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesWritten: 1, entitiesTouched: 0 });
    expect(calls.filter((c) => c.includes(ENTITY_PROMPT))).toHaveLength(0);
  });
});
