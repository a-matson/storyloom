import { describe, expect, it } from 'vitest';
import { identityLine, identityOf, presentLine } from '@core/context/cast';
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

describe('identity from looks (M30-2)', () => {
  const look = (key: string, value: string): Assertion => ({ ...base, id: `l_${key}`, at: 0, since: 0, kind: 'look', key, value });
  const card: Assertion = { ...base, id: 'i', at: 0, since: 0, kind: 'identity', text: 'Minos is a ferryman of the dark river.' };
  const dragon = [
    card,
    look('species', 'dragon'),
    look('body', '7 meters tall, quadruped with wings'),
    look('skin', 'base burgundy red, ochre underbelly'),
    look('horns', '2 black horns'),
    look('eyes', 'deep green'),
  ];

  it('a dragon with looks sends size, colour, species and two features', () => {
    expect(identityOf(minos, dragon)).toBe('7 meters tall burgundy dragon, 2 black horns, deep green eyes');
    expect(presentLine(minos, dragon, [minos], false).text).toBe('Minos (7 meters tall burgundy dragon, 2 black horns, deep green eyes).');
  });

  it('a human with looks, or no looks: the identity unchanged', () => {
    for (const as of [[card, look('species', 'human'), look('eyes', 'blue')], [card, look('species', 'woman')], [card]])
      expect(identityOf(minos, as)).toBe('a ferryman of the dark river');
  });

  it('a non-human species with no other looks sends just the species', () => {
    expect(identityOf(minos, [card, look('species', 'kobold')])).toBe('kobold');
  });

  it('body parts fill the features the horns and eyes leave', () => {
    expect(identityOf(minos, [look('species', 'wyvern'), look('body', 'huge, with wings and a tail'), look('horns', 'curled horns')])).toBe(
      'huge wyvern, curled horns, wings',
    );
  });

  it('never more than 12 words after the species', () => {
    const long = [look('species', 'great old dragon of fire'), look('horns', 'six long curved black horns'), look('eyes', 'deep green and gold glowing')];
    const id = identityOf(minos, long);
    expect(id).toBe('great old dragon, curved black horns, deep green eyes');
    expect(id.split('dragon')[1]?.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(12);
  });

  it('a carded dragon still sends no identity', () => {
    expect(presentLine(minos, dragon, [minos], true).text).toBe('Minos.');
  });
});

describe('identityLine', () => {
  const trait = (id: string, text: string): Assertion => ({ ...base, id, at: 1, since: 1, kind: 'trait', text });
  const facts = [trait('t1', 'He fears water.'), { ...base, id: 'r1', at: 1, since: 1, kind: 'relationship', to: 'Lena', stance: 'owes her money' } as const];

  it('with facts: `Name (identity): a; b.`, and the fact ids', () => {
    const as: Assertion[] = [{ ...base, id: 'i', at: 0, since: 0, kind: 'identity', text: 'Minos is a ferryman.' }, ...facts];
    expect(identityLine(minos, as, false, facts)).toEqual([
      { entity: minos, text: 'Minos (a ferryman): He fears water; owes her money (Lena).', factIds: ['t1', 'r1'] },
    ]);
  });

  it('with facts and no identity: `Name — a; b.`; carded: nothing', () => {
    expect(identityLine(minos, facts, false, facts)[0]?.text).toBe('Minos — He fears water; owes her money (Lena).');
    expect(identityLine(minos, facts, true, facts)).toEqual([]);
  });
});

describe('presentLine', () => {
  it('an unseen effect is not sent, even while its condition holds', () => {
    const as: Assertion[] = [effect('e1', 'awake', 1, false), { ...base, id: 's1', at: 1, since: 1, kind: 'state', key: 'condition', value: 'awake' }];
    expect(presentLine(minos, as, [minos], false).text).toBe('Minos — awake.');
  });

  it('a proposed state is never sent', () => {
    const s = { ...base, at: 1, since: 1, kind: 'state', key: 'condition' } as const;
    const as: Assertion[] = [
      { ...s, id: 's1', value: 'awake' },
      { ...s, id: 's2', at: 2, since: 2, value: 'furious', basis: 'inferred', seen: false },
    ];
    const line = presentLine(minos, as, [minos], false);
    expect(line.text).toBe('Minos — awake.');
    expect(line.factIds).toEqual(['s1']);
  });

  it('a seen effect is sent, once', () => {
    const as: Assertion[] = [effect('e1', 'cursed', 1), effect('e2', 'cursed', 2, true)];
    expect(presentLine(minos, as, [minos], false).text).toBe('Minos — cursed — Amulet.');
  });

  it('a stance swaps its word once events cross it (M26-6)', () => {
    const lena: Entity = { ...minos, id: 'ent_lena', name: 'Lena' };
    const rel = (id: string, to: string): Assertion => ({ ...base, id, at: 1, since: 1, kind: 'relationship', to, stance: 'wary' });
    const ev = (at: number, text: string, who: string[]): Assertion => ({
      ...base,
      id: `ev${at}`,
      subject: who[0] ?? '',
      at,
      since: at,
      kind: 'event',
      text,
      who,
    });
    const as = [rel('r1', 'you'), rel('r2', 'Lena')];
    expect(presentLine(minos, as, [minos, lena], false).text).toBe('Minos — wary. With Lena: wary.');
    const evs = [
      ev(2, 'You rescue Minos', ['you', minos.id]),
      ev(3, 'You heal Minos', ['you', minos.id]),
      ev(4, 'Lena threatens Minos', [lena.id, minos.id]),
      ev(5, 'Lena attacks Minos', [lena.id, minos.id]),
    ];
    expect(presentLine(minos, [...as, ...evs], [minos, lena], false).text).toBe('Minos — trusts you. With Lena: fears.');
  });

  it('a punctuation stance renders nothing (M24-5)', () => {
    const lena: Entity = { ...minos, id: 'ent_lena', name: 'Lena' };
    const rel = (id: string, to: string): Assertion => ({ ...base, id, at: 1, since: 1, kind: 'relationship', to, stance: ',.' });
    const line = presentLine(minos, [rel('r1', 'you'), rel('r2', 'Lena')], [minos, lena], false);
    expect(line.text).toBe('Minos.');
    expect(line.factIds).toEqual([]);
  });
});
