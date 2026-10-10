import { describe, expect, it } from 'vitest';
import type { Entity } from '@core/model/types';
import { faceFor } from '@ui/features/game/entities/faceFor';

const ent = (name: string, aliases: string[] = [], kind: Entity['kind'] = 'character'): Entity => ({
  id: `e-${name}`,
  kind,
  name,
  aliases,
  description: '',
  facts: [],
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 1,
});

const mira = ent('Mira', ['the smith']);
const orrin = ent('Orrin');
const mill = ent('Mira Mill', [], 'place');
const cast = [mira, orrin, mill];

describe('faceFor', () => {
  it('the speaker label wins over named characters', () => {
    expect(faceFor('Mira looks at Orrin.', 'Orrin', cast)).toBe(orrin);
    expect(faceFor('Anything.', 'Gone', cast)).toBeUndefined();
  });

  it('one named character gets the face; two get none', () => {
    expect(faceFor('Mira wipes her hands.', undefined, cast)).toBe(mira);
    expect(faceFor('Mira glares at Orrin.', undefined, cast)).toBeUndefined();
    expect(faceFor('Miranda waits.', undefined, cast)).toBeUndefined();
  });

  it('matches an alias as whole words, ignoring case', () => {
    expect(faceFor('The smith nods.', undefined, cast)).toBe(mira);
  });

  it('ignores names inside quotes and non-character entities', () => {
    expect(faceFor('"Orrin, run!" Mira shouts.', undefined, cast)).toBe(mira);
    expect(faceFor('"Mira!" someone calls.', undefined, cast)).toBeUndefined();
  });

  it('falls back to the one present character only when present is given', () => {
    expect(faceFor('"Fine," comes the reply.', undefined, cast, ['Orrin'])).toBe(orrin);
    expect(faceFor('"Fine," comes the reply.', undefined, cast)).toBeUndefined();
    expect(faceFor('"Fine."', undefined, cast, ['Orrin', 'Mira'])).toBeUndefined();
    expect(faceFor('Mira laughs.', undefined, cast, ['Orrin'])).toBe(mira);
  });
});
