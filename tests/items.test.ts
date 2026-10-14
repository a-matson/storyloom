import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { indexAssertions } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import { heldBy, itemsAt, itemsHere, YOU } from '@core/memory/items';
import { setValue } from '@core/memory/looks';
import type { Entity } from '@core/model';

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
    expect(renderScene(scene, all, ix)).toBe('the tower · Present: Korthak · Here: a lamp, Ledger, Key (Korthak) · You hold: Horn');
    const many = Array.from({ length: 7 }, (_, i) => ent(`Coin${i}`, 'item'));
    expect(renderScene(undefined, many, indexAssertions(many.flatMap((c) => where(c, 'holder', 'you'))))).toBe('You hold: Coin0, Coin1, Coin2, Coin3, Coin4');
  });
});
