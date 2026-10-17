import { expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { groupCount } from '@core/memory/groups';
import { introduce } from '@core/memory/introduce';
import type { CompletionRequest } from '@core/ports';
import { fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

it('counts the members a passage numbers, by the faction’s name without "the" or a plural', () => {
  const harrows = { name: 'The Harrows', aliases: [] };
  expect(groupCount('Three Harrow enforcers block the door.', harrows)).toBe(3);
  expect(groupCount('12 Harrows wait outside.', harrows)).toBe(12);
  expect(groupCount('A Harrow spits.', harrows)).toBeUndefined();
  expect(groupCount('The Harrows want the ledger.', harrows)).toBeUndefined();
  expect(groupCount('two burly dockside Harrows', harrows)).toBe(2);
  expect(groupCount('four men of the Watch', { name: 'Ashen Order', aliases: ['the Watch'] })).toBeUndefined();
  expect(groupCount('five Watch soldiers', { name: 'Ashen Order', aliases: ['the Watch'] })).toBe(5);
});

it('the turn read lists a confirmed faction in the enum, not an unconfirmed one, with no stay key; listed, it is a group', async () => {
  const adv = memoryAdventure(19);
  adv.settings.memory = { ...adv.settings.memory, introductions: false, sceneEachTurn: true };
  const last = adv.actions.at(-1);
  if (last) last.versions = ['Three Harrow enforcers wait at the ferry with Tamsin.'];
  const reqs: CompletionRequest[] = [];
  const scene = { location: 'the ferry', present: ['Tamsin', 'The Harrows'], stay: {}, weather: 'fog' };
  const provider = fakeProvider(
    async function* (req) {
      reqs.push(req);
      yield { text: JSON.stringify({ scene }), done: true };
    },
    false,
    true,
  );
  const of = (name: string, kind: 'character' | 'faction', lastSeen: number) => ({ ...mergeEntity(undefined, { name, kind, description: '' }, 0), lastSeen });
  const [tamsin, harrows] = (adv.entities = [of('Tamsin', 'character', 0), of('The Harrows', 'faction', 4), of('The Gulls', 'faction', 0)]);
  adv.plot.scene = { location: 'the ferry', present: [tamsin?.id ?? ''] };
  await introduce(adv, { provider, template: adv.settings.template });
  const schema = JSON.stringify(reqs[0]?.jsonSchema);
  expect(schema).toContain('"enum":["Tamsin","The Harrows"]');
  expect(schema).toContain('"required":["Tamsin"]');
  expect(reqs[0]?.prompt).toContain('A faction listed in present means members of it are there.');
  expect(reqs[0]?.prompt).toContain('Known characters: Tamsin. Known factions: The Harrows.');
  expect(adv.plot.scene).toMatchObject({ present: [tamsin?.id], groups: [{ id: harrows?.id, count: 3 }] });
});
