import { describe, expect, it } from 'vitest';
import { foldEntities, type Incoming } from '@core/memory/fold';
import { withLooks } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import { speciesConflict, swapWord } from '@core/memory/species';
import type { Assertion, Entity } from '@core/model';

describe('speciesConflict', () => {
  it('flags an identity species the look contradicts (F3, F7), and nothing without both', () => {
    expect(speciesConflict('A massive orc with a scarred face', 'minotaur')).toEqual({ claimed: 'orc', canon: 'minotaur' });
    expect(speciesConflict('A human with scaled boots', 'kobold')).toEqual({ claimed: 'human', canon: 'kobold' });
    expect(speciesConflict('A huge minotaur who guards the gate', 'minotaur')).toBeUndefined();
    expect(speciesConflict('A human woman who runs the inn', undefined)).toBeUndefined();
    expect(speciesConflict('An old goblin', undefined)).toBeUndefined();
    expect(speciesConflict('A group of insectoid creatures', 'kobold')).toBeUndefined();
    // Whole words: "humanoid" is no human.
    expect(speciesConflict('A humanoid shape', 'kobold')).toBeUndefined();
  });

  it('swapWord keeps a capital, and dropping the word tidies the space', () => {
    expect(swapWord('Orc, a massive orc.', 'orc', 'minotaur')).toBe('Minotaur, a massive minotaur.');
    expect(swapWord('a massive orc, scarred', 'orc', '')).toBe('a massive, scarred');
  });
});

describe('foldEntities', () => {
  it('flags a species look that contradicts the identity once, however often it is folded', () => {
    const adv = createBlankAdventure('T', '');
    const text = 'You see Minos, a massive orc, at the door. You ask Minos the minotaur to move.';
    adv.actions = [{ id: 'a0', type: 'continue', versions: [text], active: 0, createdAt: 0 }];
    const fold = (over: Partial<Incoming>) =>
      foldEntities(adv, [{ name: 'Minos', kind: 'character', description: '', facts: [], ...over }], `[0] ${text}`, { fromAction: 0, toAction: 1 });
    fold({ description: 'Minos, a massive orc, at the door.' });
    fold({ looks: { species: 'minotaur' } });
    fold({ looks: { species: 'minotaur' } });
    expect(adv.assertions.filter((a) => a.kind === 'conflict')).toEqual([
      expect.objectContaining({ key: 'species', claimed: 'orc', canon: 'minotaur', seen: false }),
    ]);
  });
});

describe('withLooks', () => {
  const e: Entity = { id: 'm', kind: 'character', name: 'Minos', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 };
  const base = { subject: 'm', producer: 'turn', at: 0, basis: 'stated', since: 0 } as const;
  const as: Assertion[] = [
    { ...base, id: 'i', kind: 'identity', text: 'a massive orc' },
    { ...base, id: 'l', kind: 'look', key: 'species', value: 'minotaur' },
  ];

  it('drops the identity species word while a species conflict is open', () => {
    expect(withLooks(e, as).description).toBe('a massive orc');
    const open: Assertion = { ...base, id: 'c', kind: 'conflict', key: 'species', claimed: 'orc', canon: 'minotaur', seen: false };
    expect(withLooks(e, [...as, open]).description).toBe('a massive');
  });
});
