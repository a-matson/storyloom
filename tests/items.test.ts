import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { indexAssertions } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, type Incoming } from '@core/memory/fold';
import { heldBy, itemsAt, itemsHere, YOU } from '@core/memory/items';
import { setValue } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Entity } from '@core/model';

const ent = (name: string, kind: Entity['kind']): Entity => ({ ...mergeEntity(undefined, { name, kind, description: '' }, 0), id: `ent_${name}` });
const where = (e: Entity, key: string, value: string) => setValue(e, [], key, value, 0);

const korthak = ent('Korthak', 'character');
const tower = ent('Tower', 'place');
const horn = ent('Horn', 'item');
const key = ent('Key', 'item');
const ledger = ent('Ledger', 'item');
const all = [korthak, tower, horn, key, ledger];
const ix = indexAssertions([...where(horn, 'holder', 'you'), ...where(key, 'holder', 'Korthak the Bold'), ...where(ledger, 'location', 'the tower')]);

describe('items', () => {
  it('finds what a holder holds and what lies at a place', () => {
    expect(heldBy(all, ix, YOU)).toEqual([horn]);
    expect(heldBy(all, ix, 'Korthak')).toEqual([key]);
    expect(itemsAt(all, ix, 'Tower')).toEqual([ledger]);
  });

  it('the scene line holds your items and lists what is here, a held one with its holder, five at most', () => {
    const scene = { location: 'the tower', present: ['Korthak'], items: ['the horn', 'a lamp'] };
    expect(itemsHere(scene, all, ix)).toEqual(['a lamp', 'Ledger', 'Key (Korthak)']);
    expect(renderScene(scene, all, ix)).toBe('the tower · Present: Korthak · You hold: Horn · Here: a lamp, Ledger, Key (Korthak)');
    const many = Array.from({ length: 7 }, (_, i) => ent(`Coin${i}`, 'item'));
    expect(renderScene(undefined, many, indexAssertions(many.flatMap((c) => where(c, 'holder', 'you'))))).toBe('You hold: Coin0, Coin1, Coin2, Coin3, Coin4');
  });
});

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });

describe('folding a carried item', () => {
  const fold = (texts: string[], incoming: Incoming[]) => {
    const adv = createBlankAdventure('T', '');
    adv.actions = texts.map((t, i) => act(`a${i}`, t));
    const passage = texts.map((t, i) => `[${i}] ${t}`).join('\n');
    foldEntities(adv, incoming, passage, { fromAction: 0, toAction: texts.length });
    return adv;
  };
  const item = (state: Record<string, string>): Incoming => ({ name: 'Horn', kind: 'item', description: 'A brass horn.', state });

  it('keeps a lower-case item only with a holder, the sentence naming it as its span', () => {
    const adv = fold(['You lift the horn from the hook.'], [item({ holder: 'you' })]);
    expect(adv.assertions.flatMap((a) => (a.kind === 'state' ? [[a.key, a.value, a.span]] : []))).toEqual([
      ['holder', 'you', 'You lift the horn from the hook.'],
    ]);
    expect(fold(['You lift the horn from the hook.'], [item({ location: 'the hook' })]).entities).toEqual([]);
  });

  it('drops a holder on anything but an item', () => {
    const adv = fold(['You meet Mira. Mira carries you.'], [{ name: 'Mira', kind: 'character', description: '', state: { holder: 'you' } }]);
    expect(adv.assertions).toEqual([]);
  });
});
