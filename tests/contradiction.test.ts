import { describe, expect, it } from 'vitest';
import { checkInputs, checkOutput, recordLines } from '@core/memory/contradiction';
import type { Adventure, Assertion, LegacyEntity } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { makeAdventure } from './fixtures/adventure';
import { derived } from './fixtures/assertions';
import { fakeProvider } from './fixtures/memoryJobs';

const entity = (name: string, extra: Partial<LegacyEntity> = {}): LegacyEntity => ({
  id: `ent_${name}`,
  kind: 'character',
  name,
  aliases: [],
  description: '',
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
  ...extra,
});

function adventure(entities: LegacyEntity[], scene?: Adventure['plot']['scene']): Adventure {
  const adv = makeAdventure({ actions: 2, cards: 0 });
  adv.entities = entities;
  adv.plot = { ...adv.plot, scene };
  return derived(adv);
}

describe('checkInputs', () => {
  const mira = entity('Mira', {
    canon: true,
    description: 'A ferrywoman.',
    state: { hair: 'grey', mood: 'calm' },
    canonKeys: ['hair'],
    facts: [
      { id: 'f1', text: 'She is afraid of horses.', fromAction: 0, source: 'player', pinned: true },
      {
        id: 'f2',
        text: 'the story says hair is red, but canon says grey',
        fromAction: 0,
        source: 'memory',
        conflict: true,
        claim: { key: 'hair', value: 'red' },
      },
    ],
  });

  it('takes the scene and the locked values of who is present, nothing else, with the setting on', () => {
    const adv = adventure([mira, entity('Aldric', { canon: true, description: 'Her brother.' })], { location: 'The quay', present: ['ent_Mira'] });
    adv.settings.memory.contradictionCheck = true;
    expect(checkInputs(adv)).toEqual(['Scene: The quay · Present: Mira', 'Mira: hair is grey']);
  });

  it('takes only the locked values with the setting off', () => {
    const adv = adventure([mira], { location: 'The quay', present: ['ent_Mira'] });
    expect(adv.settings.memory.contradictionCheck).toBe(false);
    expect(checkInputs(adv)).toEqual(['Mira: hair is grey']);
  });

  it('is empty with the setting off and nobody locked present, so no call', () => {
    const adv = adventure([mira], { location: 'The quay', present: [] });
    expect(checkInputs(adv)).toEqual([]);
  });

  it('with the setting on, takes the scene alone when nobody locked is present', () => {
    const adv = adventure([mira], { location: 'The quay', present: [] });
    adv.settings.memory.contradictionCheck = true;
    expect(checkInputs(adv)).toEqual(['Scene: The quay']);
  });
});

describe('checkOutput', () => {
  const LINES = ['Ysolde Marr: She has a shaved head.', 'Scene: The quay'];
  const run = async (reply: object) => {
    const requests: CompletionRequest[] = [];
    const provider = fakeProvider(
      async function* (req) {
        requests.push(req);
        yield { text: JSON.stringify(reply), done: true };
      },
      false,
      true,
    );
    const fact = await checkOutput('Ysolde shakes out her long braids.', LINES, { provider, template: 'chatml' });
    return { fact, requests };
  };

  it('returns the input line the output breaks', async () => {
    const { fact, requests } = await run({ contradicts: true, fact: 'She has a shaved head.' });
    expect(fact).toBe('Ysolde Marr: She has a shaved head.');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ slotId: 1, maxTokens: 60, temperature: 0, cachePrompt: false });
    expect(requests[0]?.jsonSchema).toBeDefined();
  });

  it('drops a fact that is not among the lines', async () => {
    expect((await run({ contradicts: true, fact: 'Ysolde has red hair.' })).fact).toBeNull();
  });

  it('is null when nothing contradicts', async () => {
    expect((await run({ contradicts: false, fact: 'She has a shaved head.' })).fact).toBeNull();
  });

  it('makes no call without lines', async () => {
    let calls = 0;
    // oxlint-disable-next-line require-yield -- never called
    const provider = fakeProvider(async function* () {
      calls++;
    });
    expect(await checkOutput('text', [], { provider, template: 'chatml' })).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('recordLines', () => {
  const base = { subject: 'ent_Mira', producer: 'turn', basis: 'stated', since: 0 } as const;
  const assertions: Assertion[] = [
    { ...base, id: 'a1', at: 1, kind: 'look', key: 'species', value: 'elf' },
    { ...base, id: 'a2', at: 2, kind: 'relationship', to: 'ent_Aldric', stance: 'distrusts him' },
    { ...base, id: 'a3', at: 3, kind: 'event', text: 'Mira burned the letter', who: ['ent_Mira'] },
    { ...base, id: 'a4', at: 4, kind: 'trait', text: 'She is a smuggler', seen: false },
    { ...base, id: 'a5', at: 4, kind: 'conflict', key: 'species', claimed: 'human', canon: 'elf' },
  ];
  const entities = [entity('Mira'), entity('Aldric')];

  it('lists the current record with where each line came from, leaving out proposals and conflicts', () => {
    expect(recordLines({ entities, assertions }, ['ent_Mira'])).toEqual([
      { line: 'Mira: species is elf', at: 1 },
      { line: 'Mira → Aldric: distrusts him', at: 2 },
      { line: 'Mira: Mira burned the letter', at: 3 },
    ]);
  });
});
