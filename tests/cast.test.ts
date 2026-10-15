import { describe, expect, it } from 'vitest';
import { identityOf, presentLine } from '@core/context/cast';
import type { Assertion, Entity } from '@core/model';

const minos: Entity = { id: 'ent_minos', kind: 'character', name: 'Minos', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 };
const base = { subject: minos.id, producer: 'turn', basis: 'stated' } as const;
const effect = (id: string, condition: string, at: number, seen?: boolean): Assertion => ({
  ...base,
  id,
  at,
  since: at,
  kind: 'effect',
  condition,
  cause: { kind: 'item', text: 'Amulet' },
  ...(seen === undefined ? {} : { seen }),
});

describe('identityOf', () => {
  it('identity keeps a comma clause', () => {
    const e = { ...minos, canon: true, description: 'A massive, winged creature with red scales. It sleeps.' };
    expect(identityOf(e, [])).toBe('a massive, winged creature with red scales');
  });
});

describe('presentLine', () => {
  it('an unseen effect is not sent, even while its condition holds', () => {
    const as: Assertion[] = [effect('e1', 'awake', 1, false), { ...base, id: 's1', at: 1, since: 1, kind: 'state', key: 'condition', value: 'awake' }];
    expect(presentLine(minos, as, [minos], false).text).toBe('Minos — awake.');
  });

  it('a seen effect is sent, once', () => {
    const as: Assertion[] = [effect('e1', 'cursed', 1), effect('e2', 'cursed', 2, true)];
    expect(presentLine(minos, as, [minos], false).text).toBe('Minos — cursed — Amulet.');
  });
});
