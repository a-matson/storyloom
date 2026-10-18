import { describe, expect, it } from 'vitest';
import { correct } from '@app/session/correct';
import { entityEdits } from '@app/session/entities';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, newNamesIn, type FoldLog } from '@core/memory/fold';
import { introduce } from '@core/memory/introduce';
import { readState } from '@core/memory/stateRead';
import { playerName, YOU } from '@core/memory/you';
import { createBlankAdventure, type Action, type Adventure, type Assertion } from '@core/model';
import { guessSpeakers } from '@core/text/speakers';
import { fakeProvider, memoryAdventure } from './fixtures/memoryJobs';
import { setup } from './fixtures/session';

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });
const rowanStory = (texts: string[]) => {
  const adv = createBlankAdventure('T', 'You are Rowan, a ferry pilot on the black river.');
  adv.actions = [...adv.actions, ...texts.map((t, i) => act(`a${i}`, t))];
  return adv;
};
const reply = (answer: object) => ({
  provider: fakeProvider(
    async function* () {
      yield { text: JSON.stringify(answer), done: true };
    },
    false,
    true,
  ),
});

describe('playerName', () => {
  it('is the stored name whether or not third person is on, else the opening’s "You are X"', () => {
    const adv = rowanStory([]);
    expect(playerName(adv)).toBe('Rowan');
    adv.plot = { ...adv.plot, thirdPerson: { enabled: false, name: 'Bram' } };
    expect(playerName(adv)).toBe('Bram');
    adv.plot = { ...adv.plot, thirdPerson: { enabled: true, name: ' ' } };
    expect(playerName(adv)).toBe('Rowan');
  });

  it('is none for "You are tired." or a form of address', () => {
    expect(playerName(createBlankAdventure('T', 'You are tired.'))).toBeUndefined();
    expect(playerName(createBlankAdventure('T', 'You are Master, the keeper.'))).toBeUndefined();
    expect(playerName(createBlankAdventure('T', 'You are Ana Bel, a smith.'))).toBe('Ana Bel');
  });
});

describe('the player is never a card', () => {
  it('routes a reply entity named for the player to you as proposals, and keeps the player’s own lines', () => {
    const adv = rowanStory(['Rowan steers the ferry. Rowan is tired and wary.', 'Rowan nods to Tamsin. Tamsin waves.']);
    const mine: Assertion = { id: 'p1', subject: YOU, producer: 'player', at: 0, basis: 'player', since: 0, kind: 'trait', text: 'a ferry pilot' };
    adv.assertions = [mine];
    const log: FoldLog = { proposed: 0, rejected: [] };
    const passage = adv.actions.map((a, i) => `[${i}] ${a.versions[0] ?? ''}`).join('\n');
    const facts = ['Rowan is tired and wary.'];
    const touched = foldEntities(
      adv,
      [{ name: 'Rowan', kind: 'character', description: '', facts }],
      passage,
      { fromAction: 1, toAction: 3 },
      { twice: true, log },
    );
    expect(adv.entities).toEqual([]);
    expect(touched).toBeGreaterThan(0);
    expect(adv.assertions[0]).toBe(mine);
    expect(adv.assertions.slice(1)).toEqual([
      expect.objectContaining({ subject: YOU, kind: 'trait', text: 'Rowan is tired and wary.', seen: false, producer: 'batch' }),
    ]);
    expect(log.rejected).toEqual([expect.objectContaining({ entity: 'Rowan', reason: 'player' })]);
    expect(newNamesIn(adv, { fromAction: 1, toAction: 3 })).toEqual(['Tamsin']);
  });

  it('grounds "Rowan kneels" to you, not wrong-subject', async () => {
    const adv: Adventure = memoryAdventure(5);
    adv.actions = adv.actions.slice(-5);
    adv.plot = { ...adv.plot, thirdPerson: { enabled: false, name: 'Rowan' }, scene: { present: [] } };
    const mira = mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0);
    adv.entities = [mira];
    adv.plot.scene = { present: [mira.id] };
    for (const [i, t] of ['You wait.', 'Mira watches. Rowan kneels by the fire.'].entries()) {
      const a = adv.actions[3 + i];
      if (a) a.versions = [t];
    }
    const out = await readState(adv, {
      ...reply({ changes: [{ who: 'you', key: 'posture', now: 'kneels by the fire', at: 4 }] }),
      template: adv.settings.template,
    });
    expect(out.rejected).toEqual([]);
    expect(adv.assertions).toEqual([expect.objectContaining({ subject: YOU, kind: 'state', key: 'posture', value: 'kneels by the fire' })]);
  });

  it('never stores the player as present', async () => {
    const adv: Adventure = memoryAdventure(19);
    adv.plot = { ...adv.plot, thirdPerson: { enabled: false, name: 'Rowan' } };
    adv.settings.memory = { ...adv.settings.memory, introductions: false, sceneEachTurn: true };
    const tamsin = mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 0);
    adv.entities = [tamsin];
    const last = adv.actions.at(-1);
    if (last) last.versions = ['Rowan waits at the ferry with Tamsin.'];
    const scene = { location: 'the ferry', present: ['Tamsin', 'Rowan'], stay: {}, weather: 'fog' };
    await introduce(adv, { ...reply({ scene }), template: adv.settings.template });
    expect(adv.plot.scene?.present).toEqual([tamsin.id]);
  });

  it('gives the player’s own speech no label; another speaker alone still gets one', () => {
    const cast = [{ name: 'Tamsin', aliases: [] }];
    expect(guessSpeakers('Rowan says, "Hold on."', cast, {}, 'Rowan')).toEqual([]);
    expect(guessSpeakers('Rowan says, "Hold on." Tamsin laughs. "No."', cast, {}, 'Rowan')).toEqual([]);
    expect(guessSpeakers('Rowan nods.\n\nTamsin says, "Go."', cast, {}, 'Rowan')).toEqual([{ paragraph: 1, name: 'Tamsin' }]);
  });
});

describe('This is me', () => {
  function withRowan() {
    const adventure = createBlankAdventure('T', 'You stand at the ferry.');
    const rowan = { ...mergeEntity(undefined, { name: 'Rowan', kind: 'character', description: '' }, 0), id: 'ent_rowan' };
    const tamsin = { ...mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 0), id: 'ent_tamsin' };
    adventure.entities = [rowan, tamsin];
    const base = { producer: 'batch', at: 0, basis: 'stated', since: 0 } as const;
    adventure.assertions = [
      { ...base, id: 't1', subject: rowan.id, kind: 'trait', text: 'tired' },
      { ...base, id: 's1', subject: rowan.id, kind: 'state', key: 'posture', value: 'kneeling' },
      { ...base, id: 'k1', subject: tamsin.id, kind: 'secret', text: 'the ferry leaks', knownBy: [rowan.id, tamsin.id] },
    ];
    adventure.plot = { ...adventure.plot, scene: { present: [rowan.id, tamsin.id] } };
    return setup({ adventure });
  }

  it('moves the card’s lines to you as proposals, repoints secrets and the scene, deletes it and names you', () => {
    const { session } = withRowan();
    entityEdits(session).mergeIntoYou('ent_rowan');
    const adv = session.getSnapshot().adventure;
    expect(adv.entities.map((e) => e.id)).toEqual(['ent_tamsin']);
    expect(adv.assertions.find((a) => a.id === 't1')).toMatchObject({ subject: YOU, seen: false });
    expect(adv.assertions.find((a) => a.id === 's1')).toMatchObject({ subject: YOU });
    expect(adv.assertions.find((a) => a.id === 's1')?.seen).toBeUndefined();
    expect(adv.assertions.find((a) => a.id === 'k1')).toMatchObject({ knownBy: [YOU, 'ent_tamsin'] });
    expect(adv.plot.scene?.present).toEqual(['ent_tamsin']);
    expect(adv.plot.thirdPerson).toEqual({ enabled: false, name: 'Rowan' });
  });

  it('/correct I am Rowan names the player when no name is set', async () => {
    const { session } = withRowan();
    await correct(session, 'I am Rowan.');
    expect(session.getSnapshot().adventure.plot.thirdPerson).toEqual({ enabled: false, name: 'Rowan' });
    expect(session.getSnapshot().notice).toBe('Pinned to you; your name is Rowan');
    await correct(session, 'I am Bram');
    expect(session.getSnapshot().adventure.plot.thirdPerson?.name).toBe('Rowan');
  });
});
