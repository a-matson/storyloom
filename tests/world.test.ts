import { expect, it } from 'vitest';
import { exportScenarioJson, importScenarioJson, scenarioFromAdventure, worldOf } from '@adapters/transfer';
import type { Assertion } from '@core/model';
import { createBlankAdventure, newScenario } from '@core/model';

const base = { aliases: [], description: '', relations: [], firstSeen: 3, lastSeen: 9 };
const common = { producer: 'turn', at: 4, since: 4, basis: 'stated', span: 'Lena, the smith' } as const;

function built() {
  const a = createBlankAdventure('Corrow', 'You wake in Corrow.');
  a.storyCards = [{ id: 'card_1', name: 'Lena', type: 'character', triggers: ['Lena'], entry: 'Lena is the smith.' }];
  a.entities = [
    { ...base, id: 'ent_1', kind: 'character', name: 'Lena', cardId: 'card_1', relations: [{ to: 'ent_3', label: 'member of' }], portraitId: 'img_1' },
    { ...base, id: 'ent_2', kind: 'place', name: 'Forge', partOf: 'ent_4' },
    { ...base, id: 'ent_3', kind: 'faction', name: 'Smiths' },
    { ...base, id: 'ent_4', kind: 'place', name: 'Corrow' },
  ];
  const as: Assertion[] = [
    { ...common, id: 'as_1', subject: 'ent_1', kind: 'identity', text: 'the town smith' },
    { ...common, id: 'as_2', subject: 'ent_1', kind: 'trait', text: 'gruff' },
    { ...common, id: 'as_3', subject: 'ent_1', kind: 'look', key: 'hair', value: 'grey' },
    { ...common, id: 'as_4', subject: 'ent_1', kind: 'relationship', to: 'you', stance: 'wary' },
    { ...common, id: 'as_5', subject: 'you', kind: 'secret', text: 'You stole the anvil.', knownBy: ['you', 'ent_1'] },
    { ...common, id: 'as_6', subject: 'ent_1', kind: 'state', key: 'mood', value: 'angry' },
    { ...common, id: 'as_7', subject: 'ent_1', kind: 'event', text: 'Lena hit you.', who: ['ent_1'] },
    { ...common, id: 'as_8', subject: 'ent_1', kind: 'effect', condition: 'burned' },
    { ...common, id: 'as_9', subject: 'ent_1', kind: 'trait', text: 'cheerful', until: 6 },
    { ...common, id: 'as_10', subject: 'ent_1', kind: 'trait', text: 'tall', seen: false },
  ];
  a.assertions = as;
  const rule = { source: 'player', createdAt: 0, fromAction: 5 } as const;
  a.rules = [
    { ...rule, id: 'rule_1', text: 'Smiths never lie.', gates: ['ent_3'], status: 'confirmed' },
    { ...rule, id: 'rule_2', text: 'Snow never melts.', gates: [], status: 'proposed' },
  ];
  return a;
}

it('keeps the world and leaves the play behind', () => {
  const w = worldOf(built());
  expect(w.entities.map((e) => [e.name, e.partOf, e.firstSeen, e.portraitId])).toEqual([
    ['Lena', undefined, 0, undefined],
    ['Forge', 'ent_4', 0, undefined],
    ['Smiths', undefined, 0, undefined],
    ['Corrow', undefined, 0, undefined],
  ]);
  expect(w.assertions.map((x) => x.id)).toEqual(['as_1', 'as_2', 'as_3', 'as_4', 'as_5']);
  expect(w.assertions.every((x) => x.at === 0 && x.since === 0 && x.span === undefined)).toBe(true);
  expect(w.assertions.find((x) => x.kind === 'secret')).toMatchObject({ knownBy: [] });
  expect(w.rules.map((r) => [r.text, r.fromAction])).toEqual([['Smiths never lie.', 0]]);
});

it('opens as the adventure opened, without its summary or scene', () => {
  const a = built();
  a.plot = { ...a.plot, storySummary: 'Much happened.', plotEssentials: 'Cold.', sceneLog: [{ at: 1, location: 'ent_4' }] };
  const s = scenarioFromAdventure(a);
  expect(s.prompt).toBe('You wake in Corrow.');
  expect(s.plot.plotEssentials).toBe('Cold.');
  expect(s.plot.storySummary).toBeUndefined();
  expect(s.plot.sceneLog).toBeUndefined();
});

it('round-trips through the export with every link on the new ids', () => {
  const s = importScenarioJson(exportScenarioJson(scenarioFromAdventure(built())));
  const w = s.world;
  if (!w) throw new Error('no world');
  const byName = Object.fromEntries(w.entities.map((e) => [e.name, e]));
  const [lena, forge, smiths, corrow] = [byName['Lena'], byName['Forge'], byName['Smiths'], byName['Corrow']];
  expect(w.entities.every((e) => !/^ent_[1-4]$/.test(e.id))).toBe(true);
  expect(lena?.cardId).toBe(s.storyCards[0]?.id);
  expect(lena?.cardId).not.toBe('card_1');
  expect(lena?.relations).toEqual([{ to: smiths?.id, label: 'member of' }]);
  expect(forge?.partOf).toBe(corrow?.id);
  expect(w.assertions.filter((x) => x.subject !== 'you').every((x) => x.subject === lena?.id)).toBe(true);
  expect(new Set(w.assertions.map((x) => x.id)).size).toBe(5);
  expect(w.rules).toMatchObject([{ text: 'Smiths never lie.', gates: [smiths?.id] }]);
  expect(w.rules[0]?.id).not.toBe('rule_1');
});

it('imports a scenario without a world as before', () => {
  const s = importScenarioJson(exportScenarioJson(newScenario('Plain', 'You wait.')));
  expect(s.world).toBeUndefined();
  expect(s.prompt).toBe('You wait.');
});
