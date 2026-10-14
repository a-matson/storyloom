import { describe, expect, it } from 'vitest';
import { presentLine } from '@core/context/cast';
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

describe('presentLine', () => {
  it('sends an unseen effect only while its condition holds, once, and a seen one always', () => {
    const as: Assertion[] = [
      effect('e1', 'asleep', 1, false),
      effect('e2', 'awake', 2, false),
      effect('e3', 'awake', 3, false),
      effect('e4', 'cursed', 4),
      { ...base, id: 's1', at: 3, since: 3, kind: 'state', key: 'condition', value: 'awake' },
    ];
    expect(presentLine(minos, as, [minos], false).text).toBe('Minos — awake; awake — Amulet; cursed — Amulet.');
  });
});
