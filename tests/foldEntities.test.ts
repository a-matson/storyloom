import { describe, expect, it } from 'vitest';
import { textOf } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, uncut, type FoldLog, type Incoming } from '@core/memory/fold';
import { appearanceOf, currentStates } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Adventure, Entity } from '@core/model';

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });
const seen = (name: string, over: Partial<Incoming> = {}): Incoming => ({ name, kind: 'character', description: '', facts: [], ...over });
/** What the story says about `e` but who it is. */
const lines = (adv: Adventure, e: Entity | undefined) => adv.assertions.filter((a) => a.subject === e?.id && a.kind !== 'identity');
const said = (adv: Adventure, e: Entity | undefined) => lines(adv, e).map(textOf);

function story(texts: string[], thirdPerson?: string): Adventure {
  const adv = createBlankAdventure('T', '');
  adv.actions = texts.map((t, i) => act(`a${i}`, t));
  if (thirdPerson) adv.plot = { ...adv.plot, thirdPerson: { enabled: true, name: thirdPerson } };
  return adv;
}

function fold(adv: Adventure, incoming: Incoming[], log?: FoldLog) {
  const passage = adv.actions.map((a, i) => `[${i}] ${a.versions[0] ?? ''}`).join('\n');
  foldEntities(adv, incoming, passage, { fromAction: 0, toAction: adv.actions.length }, log && { log });
  return adv.entities;
}

describe('foldEntities', () => {
  it('drops the player, how the story addresses them, and their third-person name', () => {
    const adv = story(['You bow. "Yes, Master," says Tamsin to Aria. Aria smiles at Sir.'], 'Aria');
    const names = fold(
      adv,
      ['Master', 'My Lord', 'Sir', 'Aria', 'Tamsin'].map((n) => seen(n)),
    ).map((e) => e.name);
    expect(names).toEqual(['Tamsin']);
  });

  it('drops a new name the description makes a kind of creature', () => {
    const out = fold(story(['You see Tamsin and the Vael beyond the river.']), [
      seen('Vael', { description: 'The Vael are a race of river spirits.' }),
      seen('Tamsin', { description: 'A ferrywoman.' }),
    ]);
    expect(out.map((e) => e.name)).toEqual(['Tamsin']);
  });

  it('trims a value the grammar cap cut, and drops a cut fact with nothing whole in it', () => {
    const cutDesc = `A ferrywoman who rows the dead. She is depicted as a stern and silent figure, often shown wea`.padEnd(120, 'x');
    const adv = story(['You meet Tamsin. She rows.']);
    const [e] = fold(adv, [seen('Tamsin', { description: cutDesc, facts: ['x'.repeat(100), 'She rows.'] })]);
    expect(adv.assertions.filter((a) => a.kind === 'identity').map(textOf)).toEqual(['A ferrywoman who rows the dead.']);
    expect(said(adv, e)).toEqual(['She rows.']);
  });

  it('keeps a fact only where the passage names its subject and a sentence backs it, which becomes its span', () => {
    const adv = story(['You meet Tamsin at the ferry.', 'She owes the Iron Guild money. Rain falls.']);
    const [e] = fold(adv, [seen('Tamsin', { facts: ['She owes money to the Iron Guild.', 'She sings at night.'] })]);
    expect(lines(adv, e).map((a) => [textOf(a), a.at, a.span, a.basis, a.producer])).toEqual([
      ['She owes money to the Iron Guild.', 1, 'She owes the Iron Guild money.', 'stated', 'turn'],
    ]);
    adv.entities = [...adv.entities, mergeEntity(undefined, { name: 'Odo', kind: 'character', description: '' }, 0)];
    fold(adv, [seen('Odo', { facts: ['He owes the Iron Guild money.'] })]);
    expect(lines(adv, adv.entities[1])).toEqual([]);
  });

  it('logs every fact it proposed and every value a guard dropped, with the reason', () => {
    const adv = story(['You meet Tamsin at the ferry, where she works for the Iron Guild.', 'Rain falls.']);
    adv.entities = [mergeEntity(undefined, { name: 'Odo', kind: 'character', description: '' }, 0)];
    const log: FoldLog = { proposed: 0, rejected: [] };
    fold(
      adv,
      [
        seen('Tamsin', {
          description: 'A ferrywoman who works for the Iron Guild.',
          state: { location: 'the ferry' },
          facts: ['works for the Iron Guild', 'location: the ferry', 'She sings at night.', 'She works at the ferry.'],
        }),
        seen('Odo', { facts: ['He owes money.'] }),
        seen('Vael', { facts: ['They live in the river.'] }),
      ],
      log,
    );
    const range = { fromAction: 0, toAction: 2 };
    expect(log).toEqual({
      proposed: 6,
      rejected: [
        { entity: 'Tamsin', value: 'location: the ferry', reason: 'state-text', passageRange: range },
        { entity: 'Tamsin', value: 'She sings at night.', reason: 'no-shared-word', passageRange: range },
        { entity: 'Odo', value: 'He owes money.', reason: 'wrong-subject', passageRange: range },
        { entity: 'Vael', value: 'They live in the river.', reason: 'entity-dropped', passageRange: range },
      ],
    });
    expect(lines(adv, adv.entities[1]).flatMap((a) => (a.kind === 'trait' ? [a.text] : []))).toEqual(['She works at the ferry.']);
  });

  it('meets a value word in another form of it', () => {
    const adv = story(['You watch Tamsin. She leans on the pole, hunches over it and rubs her eyes.']);
    const [e] = fold(adv, [seen('Tamsin', { looks: { build: 'lean' }, facts: ['hunched', 'one eye'] })]);
    expect(said(adv, e)).toEqual(['build: lean', 'hunched', 'one eye']);
  });

  it('calls a fact inferred when its best sentence holds only some of its words', () => {
    const adv = story(['You watch Tamsin row the ferry across the river.']);
    const [e] = fold(adv, [seen('Tamsin', { facts: ['She earns her living as a ferrywoman on the river.'] })]);
    expect(lines(adv, e)[0]?.basis).toBe('inferred');
  });

  it('keeps a character’s backed looks, never a place’s, and lets a state replace its key', () => {
    const adv = story(['You meet Tamsin, grey-braided, at Gull Point.']);
    const [e, place] = fold(adv, [
      seen('Tamsin', { looks: { hair: 'grey braid', eyes: 'not described', wearing: 'oilskin coat' }, state: { location: 'Gull Point' } }),
      seen('Gull Point', { kind: 'place', looks: { build: 'grey stone tower' } }),
    ]);
    expect(appearanceOf(lines(adv, e))).toBe('hair: grey braid');
    expect(lines(adv, place)).toEqual([]);
    adv.actions.push(act('a1', 'Tamsin walks down to the dock.'));
    fold(adv, [seen('Tamsin', { state: { location: 'the dock' } })]);
    expect(currentStates(lines(adv, e))).toEqual({ hair: 'grey braid', location: 'the dock' });
  });

  it('merges a new name that is part of a known one, or a known one with a title its description has', () => {
    const adv = story(['Brannoch waves, the Ashen Order rides past, and Captain Marr nods.']);
    const known = (name: string, description = '') => mergeEntity(undefined, { name, kind: 'character', description }, 0);
    adv.entities = [
      known('Old Brannoch'),
      known('The Ashen Order'),
      known('Ysolde Marr', 'Captain Ysolde Marr commands the watch.'),
      known('Aldric Marr'),
      known('Gull Point'),
    ];
    const out = fold(adv, [seen('Brannoch'), seen('Ashen Order'), seen('Captain Marr'), seen('Gull Point lighthouse')]);
    expect(out.map((e) => [e.name, e.aliases])).toEqual([
      ['Old Brannoch', ['Brannoch']],
      ['The Ashen Order', ['Ashen Order']],
      ['Ysolde Marr', ['Captain Marr']],
      ['Aldric Marr', []],
      ['Gull Point', ['Gull Point lighthouse']],
    ]);
  });

  it('holds a name the batch call saw once and folds its facts, from its own range, when the second mention makes the card', () => {
    const adv = story(['You meet Oriel Vance. He has a long scar on his left cheek.', 'Rain falls.', 'Then Oriel Vance draws his sword.']);
    const log: FoldLog = { proposed: 0, rejected: [] };
    const batch = (incoming: Incoming[], fromAction: number, toAction: number) =>
      foldEntities(
        adv,
        incoming,
        adv.actions
          .slice(fromAction, toAction)
          .map((a) => a.versions[0])
          .join('\n'),
        { fromAction, toAction },
        { twice: true, log },
      );
    batch([seen('Oriel Vance', { facts: ['He has a long scar on his left cheek.'] })], 0, 2);
    expect(adv.entities).toEqual([]);
    expect(adv.scriptState.__pending?.map((p) => [p.entity.name, p.range])).toEqual([['Oriel Vance', { fromAction: 0, toAction: 2 }]]);
    expect(batch([seen('Oriel Vance', { facts: ['He draws his sword.'] })], 2, 3)).toBe(2);
    expect(lines(adv, adv.entities[0]).map((a) => [textOf(a), a.at, a.producer])).toEqual([
      ['He draws his sword.', 2, 'batch'],
      ['He has a long scar on his left cheek.', 0, 'batch'],
    ]);
    expect(adv.scriptState.__pending).toEqual([]);
    expect(log).toEqual({ proposed: 2, rejected: [] });
  });
});

describe('uncut', () => {
  it('keeps short or whole values, trims at a sentence end, else a comma', () => {
    expect(uncut('Owns a ferry')).toBe('Owns a ferry');
    const long = 'She is depicted as a stern and silent figure who rows the dead across the river every night, often shown wea';
    expect(uncut(long)).toBe('She is depicted as a stern and silent figure who rows the dead across the river every night');
    expect(uncut(`${long}.`)).toBe(`${long}.`);
  });
});
