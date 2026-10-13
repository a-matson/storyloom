import { describe, expect, it } from 'vitest';
import { current } from '@core/memory/assertionIndex';
import { mergeAssertions, mergeOwn } from '@core/memory/assertionWrites';
import { mergeEntity } from '@core/memory/entities';
import { appearanceOf, byPlayer, currentStates, setValue } from '@core/memory/looks';
import type { Assertion, Entity } from '@core/model';

const tamsin = mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 0);
type Said = { description?: string; facts?: string[]; state?: Record<string, string> };
const fold = (own: readonly Assertion[], said: Said, at: number, e: Entity = tamsin) =>
  mergeAssertions(e, own, { description: '', facts: [], ...said }, at, { producer: 'turn' });
const traits = (own: readonly Assertion[]) => current(own, 'trait').map((a) => a.text);

describe('mergeAssertions', () => {
  it('stamps a new line with its producer, action and source', () => {
    const own = mergeAssertions(tamsin, [], { description: 'A ferrywoman.', facts: ['She owes the guild.'] }, 4, {
      producer: 'batch',
      source: () => ({ at: 2, span: 'owes the guild' }),
    });
    expect(own).toEqual([
      expect.objectContaining({ kind: 'identity', text: 'A ferrywoman.', subject: tamsin.id, producer: 'batch', at: 2, since: 4, basis: 'stated' }),
      expect.objectContaining({ kind: 'trait', text: 'She owes the guild.', span: 'owes the guild', at: 2, since: 4 }),
    ]);
  });

  it('sets an identity once, and never on a canon or carded entity', () => {
    const once = fold([], { description: 'A ferrywoman.' }, 1);
    expect(current(fold(once, { description: 'A smuggler.' }, 2), 'identity').map((a) => a.text)).toEqual(['A ferrywoman.']);
    expect(fold([], { description: 'A smuggler.' }, 1, { ...tamsin, canon: true })).toEqual([]);
    expect(fold([], { description: 'A smuggler.' }, 1, { ...tamsin, cardId: 'card_1' })).toEqual([]);
  });

  it('appends traits, deduped by containment, the longer kept, the player’s and pinned never rewritten', () => {
    const first = fold([], { facts: ['She has a scar.'] }, 1);
    expect(traits(fold(first, { facts: ['she has  a scar', 'She rows.'] }, 2))).toEqual(['She has a scar.', 'She rows.']);
    const longer = fold(first, { facts: ['She has a scar on her left cheek.'] }, 4);
    expect(longer.map((a) => [a.id, a.kind === 'trait' && a.text, a.since])).toEqual([[first[0]?.id, 'She has a scar on her left cheek.', 4]]);
    const mine = [byPlayer(tamsin.id, 1, { kind: 'trait', text: 'She has a scar.' })];
    expect(traits(fold(mine, { facts: ['She has a scar on her left cheek.'] }, 4))).toEqual(['She has a scar.', 'She has a scar on her left cheek.']);
    const pinned = first.map((a) => ({ ...a, pinned: true }));
    expect(traits(fold(pinned, { facts: ['She has a scar on her left cheek.'] }, 4))).toHaveLength(2);
  });

  it('ends a key’s current value when a new one arrives, ignores the same value, and an item’s holder and place end each other', () => {
    const first = fold([], { state: { location: 'the tavern' } }, 4);
    const next = fold(first, { state: { location: 'the docks' } }, 23);
    expect(currentStates(next)).toEqual({ location: 'the docks' });
    expect(next.map((a) => a.until)).toEqual([23, undefined]);
    expect(fold(next, { state: { location: 'The docks' } }, 30)).toHaveLength(2);
    const ledger = { ...tamsin, kind: 'item' as const };
    const held = fold([], { state: { holder: 'you' } }, 1, ledger);
    expect(currentStates(fold(held, { state: { location: 'the vault' } }, 3, ledger))).toEqual({ location: 'the vault' });
  });

  it('keeps a locked value: a closed key records one conflict per claim, a free-text key one proposal, neither current', () => {
    const e = { ...tamsin, canonKeys: ['eyes', 'hair'] };
    const own = [byPlayer(e.id, 0, { kind: 'look', key: 'eyes', value: 'grey' }), byPlayer(e.id, 0, { kind: 'look', key: 'hair', value: 'black' })];
    const once = fold(own, { state: { eyes: 'blue', hair: 'black braid', location: 'the docks' } }, 7, e);
    expect(currentStates(once)).toEqual({ eyes: 'grey', hair: 'black', location: 'the docks' });
    expect(once.filter((a) => a.kind === 'conflict')).toEqual([expect.objectContaining({ key: 'eyes', claimed: 'blue', canon: 'grey', since: 7 })]);
    expect(once.filter((a) => a.seen === false)).toEqual([expect.objectContaining({ kind: 'look', key: 'hair', value: 'black braid' })]);
    expect(fold(once, { state: { eyes: 'Blue', hair: 'black braid' } }, 9, e)).toHaveLength(once.length);
    expect(fold(once, { state: { eyes: 'grey' } }, 9, e)).toHaveLength(once.length);
  });
});

describe('player values', () => {
  it('a value ends the key’s current one; an empty one clears it; an item’s holder ends its place', () => {
    const story = fold([], { state: { location: 'the docks', mood: 'calm' } }, 3);
    const next = setValue(tamsin, story, 'location', 'the tavern', 5);
    expect(currentStates(next)).toEqual({ mood: 'calm', location: 'the tavern' });
    expect(next.at(-1)).toMatchObject({ producer: 'player', basis: 'player', since: 5 });
    expect(currentStates(setValue(tamsin, next, 'location', '', 6))).toEqual({ mood: 'calm' });
    const ledger = { ...tamsin, kind: 'item' as const };
    expect(currentStates(setValue(ledger, fold([], { state: { location: 'the tower' } }, 1, ledger), 'holder', 'you', 2))).toEqual({ holder: 'you' });
  });

  it('looks read in a fixed order, else the legacy free text', () => {
    const legacy = setValue(tamsin, [], 'legacy', 'Grey hair.', 1);
    expect(appearanceOf(legacy)).toBe('Grey hair.');
    const e = fold(legacy, { state: { wearing: 'a blue coat', eyes: 'green', mood: 'wary' } }, 1);
    expect(appearanceOf(e)).toBe('eyes: green, wearing: a blue coat');
    expect(appearanceOf(fold(e, { state: { wearing: 'a red cloak' } }, 3))).toBe('eyes: green, wearing: a red cloak');
  });
});

describe('mergeOwn', () => {
  it('moves the other entity’s lines over, leaving out a trait, an identity and a current value the target has', () => {
    const odo = mergeEntity(undefined, { name: 'The ferrywoman', kind: 'character', description: '' }, 0);
    const into = fold([], { description: 'A ferrywoman.', facts: ['She owes the guild.'], state: { mood: 'wary' } }, 2);
    const from = fold(
      [],
      { description: 'Rows the night ferry.', facts: ['she owes the guild', 'She has a scar.'], state: { mood: 'calm', location: 'the docks' } },
      9,
      odo,
    );
    const merged = mergeOwn(tamsin, into, from);
    expect(merged.every((a) => a.subject === tamsin.id)).toBe(true);
    expect(traits(merged)).toEqual(['She owes the guild.', 'She has a scar.']);
    expect(current(merged, 'identity').map((a) => a.text)).toEqual(['A ferrywoman.']);
    expect(currentStates(merged)).toEqual({ mood: 'wary', location: 'the docks' });
  });
});
