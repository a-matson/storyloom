import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, type Incoming } from '@core/memory/fold';
import { heldBy, itemsAt, itemsHere, setWhere, YOU } from '@core/memory/items';
import { currentStates } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Entity } from '@core/model';

const ent = (name: string, kind: Entity['kind'], state: Record<string, string> = {}): Entity => ({
  ...mergeEntity(undefined, { name, kind, description: '', facts: [] }, 0),
  id: `ent_${name}`,
  state,
});

const korthak = ent('Korthak', 'character');
const tower = ent('Tower', 'place');
const horn = ent('Horn', 'item', { holder: 'you' });
const key = ent('Key', 'item', { holder: 'Korthak the Bold' });
const ledger = ent('Ledger', 'item', { location: 'the tower' });
const all = [korthak, tower, horn, key, ledger];

describe('items', () => {
  it('finds what a holder holds and what lies at a place', () => {
    expect(heldBy(all, YOU)).toEqual([horn]);
    expect(heldBy(all, 'Korthak')).toEqual([key]);
    expect(itemsAt(all, 'Tower')).toEqual([ledger]);
  });

  it('a holder ends the place and a place ends the holder, for the player and the story', () => {
    const held = { ...ledger, ...setWhere(ledger, 'holder', 'you') };
    expect(currentStates(held)).toEqual({ holder: 'you' });
    const story = mergeEntity(held, { name: 'Ledger', kind: 'item', description: '', facts: [], state: { location: 'the vault' } }, 3);
    expect(story.facts.map((f) => [f.key, f.until])).toEqual([['location', undefined]]);
    const back = mergeEntity(story, { name: 'Ledger', kind: 'item', description: '', facts: [], state: { holder: 'Korthak' } }, 4);
    expect(back.facts.map((f) => [f.key, f.until])).toEqual([
      ['location', 4],
      ['holder', undefined],
    ]);
  });

  it('the scene line holds your items and lists what is here, a held one with its holder, five at most', () => {
    const scene = { location: 'the tower', present: ['Korthak'], items: ['the horn', 'a lamp'] };
    expect(itemsHere(scene, all)).toEqual(['a lamp', 'Ledger', 'Key (Korthak)']);
    expect(renderScene(scene, all)).toBe('the tower · Present: Korthak · You hold: Horn · Here: a lamp, Ledger, Key (Korthak)');
    const many = Array.from({ length: 7 }, (_, i) => ent(`Coin${i}`, 'item', { holder: 'you' }));
    expect(renderScene(undefined, many)).toBe('You hold: Coin0, Coin1, Coin2, Coin3, Coin4');
  });
});

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });

describe('folding a carried item', () => {
  const fold = (texts: string[], incoming: Incoming[]) => {
    const adv = createBlankAdventure('T', '');
    adv.actions = texts.map((t, i) => act(`a${i}`, t));
    const passage = texts.map((t, i) => `[${i}] ${t}`).join('\n');
    foldEntities(adv, incoming, passage, { fromAction: 0, toAction: texts.length });
    return adv.entities;
  };
  const item = (state: Record<string, string>): Incoming => ({ name: 'Horn', kind: 'item', description: 'A brass horn.', state });

  it('keeps a lower-case item only with a holder, the sentence naming it as evidence', () => {
    const [h] = fold(['You lift the horn from the hook.'], [item({ holder: 'you' })]);
    expect(h?.facts.map((f) => [f.text, f.evidence])).toEqual([['holder: you', 'You lift the horn from the hook.']]);
    expect(fold(['You lift the horn from the hook.'], [item({ location: 'the hook' })])).toEqual([]);
  });

  it('drops a holder on anything but an item', () => {
    const [m] = fold(['You meet Mira. Mira carries you.'], [{ name: 'Mira', kind: 'character', description: '', state: { holder: 'you' } }]);
    expect(m?.facts).toEqual([]);
  });
});
