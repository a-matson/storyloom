import { describe, expect, it } from 'vitest';
import { textOf } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, uncut, type FoldLog, type Incoming } from '@core/memory/fold';
import { appearanceOf, currentStates } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import { editDistance, spellingOf } from '@core/memory/spelling';
import { ExtractionJson } from '@core/schema/extraction';
import type { Action, Adventure, Entity } from '@core/model';
import { told } from './fixtures/assertions';

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
    const adv = story(['You meet Tamsin, who rows the dead. She rows.']);
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
    const adv = story(['You meet grey-braided Tamsin at the ferry, where she works for the Iron Guild.', 'Rain falls.']);
    adv.entities = [mergeEntity(undefined, { name: 'Odo', kind: 'character', description: '' }, 0)];
    const log: FoldLog = { proposed: 0, rejected: [] };
    fold(
      adv,
      [
        seen('Tamsin', {
          description: 'A ferrywoman who works for the Iron Guild.',
          looks: { hair: 'grey braid' },
          facts: ['works for the Iron Guild', 'hair: grey braid', 'She sings at night.', 'She works at the ferry.'],
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
        { entity: 'Tamsin', value: 'hair: grey braid', reason: 'state-text', passageRange: range },
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

  it('keeps a character’s stated looks, never an inferred one or a place’s', () => {
    const adv = story(['You meet Tamsin, grey-braided, at Gull Point.']);
    const log: FoldLog = { proposed: 0, rejected: [] };
    const [e, place] = fold(
      adv,
      [
        seen('Tamsin', { looks: { hair: 'grey braid', eyes: 'not described', wearing: 'grey oilskin coat' } }),
        seen('Gull Point', { kind: 'place', looks: { build: 'grey stone tower' } }),
      ],
      log,
    );
    expect(appearanceOf(lines(adv, e))).toBe('hair: grey braid');
    expect(currentStates(lines(adv, e))).toEqual({ hair: 'grey braid' });
    expect(lines(adv, place)).toEqual([]);
    expect(log.rejected.map((r) => [r.value, r.reason])).toEqual([['grey oilskin coat', 'look-inferred']]);
  });

  it('ignores a `state` key in a batch reply: the state read owns states', () => {
    const reply = { entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', facts: [], state: { location: 'the dock' } }], speakers: [] };
    expect(ExtractionJson.parse(reply).entities[0]).not.toHaveProperty('state');
  });

  it('keeps a new identity only from a sentence naming the entity, that sentence its evidence', () => {
    const texts = ['Vorthak is a scarred orc warlord. By the fire sits Weever.', 'You greet Weever.'];
    const log: FoldLog = { proposed: 0, rejected: [] };
    const adv = story(texts);
    fold(adv, [seen('Weever', { description: 'A scarred orc warlord.' })], log);
    expect(adv.entities.map((e) => e.name)).toEqual(['Weever']);
    expect(adv.assertions.filter((a) => a.kind === 'identity')).toEqual([]);
    expect(log.rejected.map((r) => r.reason)).toEqual(['identity-unnamed']);
    // A later reply with a naming sentence gives the identity-less card one.
    adv.actions.push(act('a2', 'You learn Weever is an old weaver of nets.'));
    fold(adv, [seen('Weever', { description: 'An old net weaver.' })]);
    expect(adv.assertions.filter((a) => a.kind === 'identity').map((a) => [textOf(a), a.span])).toEqual([
      ['An old net weaver.', 'You learn Weever is an old weaver of nets.'],
    ]);
  });

  it('folds relationships towards a known name or the player, dropping one towards nobody known', () => {
    const adv = story(['You see that Tamsin trusts you, that Tamsin fears Odo and that Tamsin loves Brin.']);
    adv.entities = [mergeEntity(undefined, { name: 'Odo', kind: 'character', description: '' }, 0)];
    const log: FoldLog = { proposed: 0, rejected: [] };
    fold(
      adv,
      [
        seen('Tamsin', {
          relationships: [
            { to: 'You', stance: 'trusts' },
            { to: 'Odo', stance: 'fears him' },
            { to: 'Brin', stance: 'loves' },
          ],
        }),
      ],
      log,
    );
    const tamsin = adv.entities.find((e) => e.name === 'Tamsin');
    expect(lines(adv, tamsin).flatMap((a) => (a.kind === 'relationship' ? [[a.to, a.stance]] : []))).toEqual([
      ['you', 'trusts'],
      ['Odo', 'fears him'],
    ]);
    expect(log.rejected.map((r) => [r.value, r.reason])).toEqual([['Brin: loves', 'unknown-to']]);
  });

  it('merges a new name that is part of a known one, or a known one with a title its identity has', () => {
    const adv = story(['Brannoch waves, the Ashen Order rides past, and Captain Marr nods.']);
    const known = (name: string) => mergeEntity(undefined, { name, kind: 'character', description: '' }, 0);
    const marr = known('Ysolde Marr');
    adv.entities = [known('Old Brannoch'), known('The Ashen Order'), marr, known('Aldric Marr'), known('Gull Point')];
    adv.assertions = told(marr, { description: 'Captain Ysolde Marr commands the watch.' });
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

describe('a misspelt known name', () => {
  const texts = ['You meet Weever by the loom.', 'You thank Weaver, who owns a ferry.'];
  const weever = () => {
    const adv = story(texts);
    adv.entities = [mergeEntity(undefined, { name: 'Weever', kind: 'character', description: '' }, 0)];
    return adv;
  };

  it('makes no card and one proposal, deduped by name and capped', () => {
    const adv = weever();
    fold(adv, [seen('Weaver', { facts: ['Weaver owns a ferry.'] })]);
    fold(adv, [seen('Weaver')]);
    expect(adv.entities.map((e) => e.name)).toEqual(['Weever']);
    expect(adv.scriptState.__aliasProposals?.map((p) => [p.name, p.of])).toEqual([['Weaver', adv.entities[0]?.id]]);
    adv.scriptState.__aliasProposals = Array.from({ length: 25 }, (_, i) => ({ name: `Name${i}`, of: 'x', at: 0 }));
    fold(adv, [seen('Weaver')]);
    expect(adv.scriptState.__aliasProposals).toHaveLength(20);
    expect(adv.scriptState.__aliasProposals?.at(-1)?.name).toBe('Weaver');
  });

  it('folds the held facts onto the entity once the player accepts the alias', () => {
    const adv = weever();
    fold(adv, [seen('Weaver', { facts: ['Weaver owns a ferry.'] })]);
    adv.entities = adv.entities.map((e) => ({ ...e, aliases: ['Weaver'] }));
    fold(adv, []);
    expect(said(adv, adv.entities[0])).toEqual(['Weaver owns a ferry.']);
    expect(adv.scriptState.__pending).toEqual([]);
  });
});

describe('spellingOf', () => {
  const ent = (name: string, kind: Entity['kind'] = 'character') => mergeEntity(undefined, { name, kind, description: '' }, 0);

  it('counts edits', () => {
    expect([editDistance('weaver', 'weever'), editDistance('kitten', 'sitting'), editDistance('', 'abc')]).toEqual([1, 3, 3]);
  });

  it('finds the one known name of the kind 1-2 edits away, both of five letters or more', () => {
    expect(spellingOf([ent('Weever')], 'Weaver', 'character')?.name).toBe('Weever');
    expect(spellingOf([ent('Weever', 'place')], 'Weaver', 'character')).toBeUndefined();
    expect(spellingOf([ent('Minos')], 'Mina', 'character')).toBeUndefined();
    expect(spellingOf([ent('Weever'), ent('Weavir')], 'Weaver', 'character')).toBeUndefined();
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
