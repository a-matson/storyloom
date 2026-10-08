import { describe, expect, it } from 'vitest';
import { checkInputs, checkOutput } from '@core/memory/contradiction';
import type { Adventure, Entity } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { makeAdventure } from './fixtures/adventure';
import { fakeProvider } from './fixtures/memoryJobs';

const entity = (name: string, extra: Partial<Entity> = {}): Entity => ({
  id: `ent_${name}`,
  kind: 'character',
  name,
  aliases: [],
  description: '',
  facts: [],
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
  ...extra,
});

function adventure(entities: Entity[], scene?: Adventure['plot']['scene']): Adventure {
  const adv = makeAdventure({ actions: 2, cards: 0 });
  adv.entities = entities;
  adv.plot = { ...adv.plot, scene };
  return adv;
}

describe('checkInputs', () => {
  it('is empty with no scene, canon or pinned facts', () => {
    expect(checkInputs(adventure([entity('Mira', { description: 'A ferrywoman.' })]), 'Mira waves.')).toEqual([]);
  });

  it('takes canon entities the output names, not the others', () => {
    const adv = adventure([
      entity('Ysolde Marr', { canon: true, aliases: ['the captain'], description: 'She has a shaved head.' }),
      entity('Aldric', { canon: true, description: 'Her brother.' }),
    ]);
    expect(checkInputs(adv, 'The captain walks in.')).toEqual(['Ysolde Marr: She has a shaved head.']);
  });

  it('takes the scene, pinned facts and conflict facts', () => {
    const adv = adventure(
      [
        entity('Mira', {
          facts: [
            { id: 'f1', text: 'She is afraid of horses.', fromAction: 0, source: 'player', pinned: true },
            { id: 'f2', text: 'the story says hair is red, but canon says grey', fromAction: 0, source: 'memory', conflict: true },
            { id: 'f3', text: 'She waves.', fromAction: 0, source: 'memory' },
          ],
        }),
      ],
      { location: 'The quay', present: [] },
    );
    expect(checkInputs(adv, 'You ride off.')).toEqual([
      'Scene: The quay',
      'Mira: She is afraid of horses.',
      'Mira: the story says hair is red, but canon says grey',
    ]);
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
