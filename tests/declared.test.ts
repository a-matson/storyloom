import { describe, expect, it } from 'vitest';
import { current } from '@core/memory/assertionIndex';
import { speciesFromPlayer } from '@core/memory/declared';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, type FoldLog } from '@core/memory/fold';
import { byPlayer, currentStates } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Adventure, Assertion, Entity } from '@core/model';

const act = (type: Action['type'], text: string, i: number): Action => ({ id: `a${i}`, type, versions: [text], active: 0, createdAt: 0 });
const char = (name: string): Entity => mergeEntity(undefined, { name, kind: 'character', description: '' }, 0);
const said = (e: Entity, at: number, f: Parameters<typeof byPlayer>[2]): Assertion => ({ ...byPlayer(e.id, at, f), producer: 'turn', basis: 'stated' });

function story(lines: [Action['type'], string][], entities: Entity[], assertions: Assertion[] = []): Adventure {
  const adv = createBlankAdventure('T', '');
  adv.actions = lines.map(([t, s], i) => act(t, s, i));
  adv.entities = entities;
  adv.assertions = assertions;
  return adv;
}
const range = (adv: Adventure) => ({ fromAction: adv.actions.length - 1, toAction: adv.actions.length });
const own = (adv: Adventure, e: Entity) => adv.assertions.filter((a) => a.subject === e.id);
const species = (adv: Adventure, e: Entity) => own(adv, e).find((a) => a.kind === 'look' && a.key === 'species' && a.basis === 'player');

describe('speciesFromPlayer', () => {
  it('a named sentence with a species word writes a player species', () => {
    const g = char('Goldarok');
    const adv = story(
      [
        ['continue', 'A shadow passes.'],
        ['do', 'You bow to the quadruped dragon Goldarok.'],
      ],
      [g],
    );
    expect(speciesFromPlayer(adv, range(adv))).toBe(1);
    expect(species(adv, g)).toMatchObject({ value: 'dragon', at: 1, since: 1 });
  });

  it('an unnamed `the dragon that owes you` binds to the one character whose identity shares `owes`, at #1 though carded at #6', () => {
    const baron = char('Baron');
    const mira = char('Mira');
    const lines: [Action['type'], string][] = [
      ['start', 'You seek out the dragon that owes you money.'],
      ...Array.from({ length: 6 }, (): [Action['type'], string] => ['continue', 'Time passes.']),
    ];
    const adv = story(
      lines,
      [baron, mira],
      [
        said(baron, 6, { kind: 'identity', text: 'A man who owes you forty crowns.' }),
        said(baron, 6, { kind: 'look', key: 'species', value: 'human' }),
        said(mira, 6, { kind: 'identity', text: 'A ferrywoman with a scar.' }),
      ],
    );
    expect(speciesFromPlayer(adv, range(adv))).toBe(1);
    expect(species(adv, baron)).toMatchObject({ value: 'dragon', at: 0 });
    expect(currentStates(own(adv, baron))['species']).toBe('dragon');
    expect(own(adv, baron).find((a) => a.kind === 'look' && a.value === 'human')?.until).toBe(6);
    expect(current(own(adv, baron), 'identity')).toEqual([expect.objectContaining({ text: 'A dragon who owes you forty crowns.', basis: 'player' })]);
    expect(own(adv, baron).find((a) => a.kind === 'identity' && a.text.startsWith('A man'))?.until).toBe(6);
    expect(species(adv, mira)).toBeUndefined();
  });

  it('two characters sharing the clause word: no declaration', () => {
    const [a, b] = [char('Baron'), char('Vell')];
    const adv = story(
      [['do', 'You find the dragon that owes you.']],
      [a, b],
      [said(a, 0, { kind: 'identity', text: 'A man who owes you.' }), said(b, 0, { kind: 'identity', text: 'A woman who owes the guild.' })],
    );
    expect(speciesFromPlayer(adv, range(adv))).toBe(0);
  });

  it('a carded entity gets the species but its identity is untouched', () => {
    const g = { ...char('Goldarok'), cardId: 'card_1', description: 'A man of the hills.' };
    const adv = story([['say', '"Goldarok, you are a dragon!"']], [g]);
    speciesFromPlayer(adv, range(adv));
    expect(species(adv, g)).toMatchObject({ value: 'dragon' });
    expect(own(adv, g).some((a) => a.kind === 'identity')).toBe(false);
  });

  it('an AI line never declares; a second run adds nothing', () => {
    const g = char('Goldarok');
    const ai = story([['continue', 'Goldarok the dragon lands.']], [g]);
    expect(speciesFromPlayer(ai, range(ai))).toBe(0);
    const adv = story([['do', 'You greet Goldarok the dragon.']], [g]);
    speciesFromPlayer(adv, range(adv));
    const once = adv.assertions;
    expect(speciesFromPlayer(adv, range(adv))).toBe(0);
    expect(adv.assertions).toBe(once);
  });
});

describe('a read against the player species', () => {
  it('an unsupported species read becomes a conflict, logged as rejected', () => {
    const g = char('Goldarok');
    const adv = story(
      [
        ['do', 'You greet Goldarok the dragon.'],
        ['continue', 'Goldarok nods slowly.'],
      ],
      [g],
      [byPlayer(g.id, 0, { kind: 'look', key: 'species', value: 'dragon' })],
    );
    const log: FoldLog = { proposed: 0, rejected: [] };
    foldEntities(
      adv,
      [{ name: 'Goldarok', kind: 'character', description: '', facts: [], looks: { species: 'human' } }],
      '[1] Goldarok nods slowly.',
      range(adv),
      { log },
    );
    expect(log.rejected.map((r) => [r.value, r.reason])).toEqual([['human', 'no-shared-word']]);
    expect(currentStates(own(adv, g))['species']).toBe('dragon');
    expect(own(adv, g).filter((a) => a.kind === 'conflict')).toEqual([
      expect.objectContaining({ key: 'species', claimed: 'human', canon: 'dragon', seen: false }),
    ]);
  });
});
