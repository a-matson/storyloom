import { describe, expect, it } from 'vitest';
import { checkSelection } from '@app/session/continuity';
import { createBlankAdventure, type Entity } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { fakeProvider } from './fixtures/memoryJobs';

const mira: Entity = { id: 'ent_mira', kind: 'character', name: 'Mira', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 3 };

function host() {
  const adv = createBlankAdventure('Test', 'You stand at the gate.');
  adv.entities = [mira];
  adv.assertions = [{ id: 'a1', subject: mira.id, producer: 'turn', basis: 'stated', since: 2, at: 2, kind: 'look', key: 'species', value: 'elf' }];
  const requests: CompletionRequest[] = [];
  const provider = fakeProvider(
    async function* (req) {
      requests.push(req);
      yield { text: JSON.stringify({ contradicts: true, fact: 'Mira: species is elf' }), done: true };
    },
    false,
    true,
  );
  const errors: string[] = [];
  const h = {
    adv,
    getSnapshot: () => ({ busy: false }),
    helperModel: () => Promise.resolve({ provider, template: 'chatml' as const }),
    onError: (m: string) => errors.push(m),
  } as unknown as Parameters<typeof checkSelection>[0];
  return { h, requests, errors };
}

describe('checkSelection', () => {
  it('finds the record line a passage naming Mira contradicts, at the action it came from', async () => {
    const { h, requests, errors } = host();
    expect(await checkSelection(h, 'Mira, the only human in the village, waved.')).toEqual([{ fact: 'Mira: species is elf', at: 2 }]);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('makes no call for a passage naming nobody', async () => {
    const { h, requests } = host();
    expect(await checkSelection(h, 'The rain kept falling.')).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
