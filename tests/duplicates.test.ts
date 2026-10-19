import { describe, expect, it } from 'vitest';
import { cardProposals, duplicateOf, titleOf } from '@core/memory/duplicates';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, type Incoming } from '@core/memory/fold';
import { createBlankAdventure } from '@core/model/scenario';
import type { Entity } from '@core/model';

const ent = (name: string, kind: Entity['kind'] = 'character', at = 0, aliases: string[] = []): Entity => ({
  ...mergeEntity(undefined, { name, kind, description: '' }, at),
  aliases,
});

describe('duplicateOf', () => {
  // The M17 export's four Caradocs.
  const reed = ent('Caradoc Reed', 'character', 20);
  const tamsin = ent('Tamsin', 'character', 2, ['Tamsin Reed']);
  const father = ent('Father Caradoc', 'character', 170);
  const caradoc = ent('Caradoc', 'character', 194);
  const all = [tamsin, reed, ent('Reed', 'character', 146), father, caradoc];

  it('finds the card holding the name words, titles stripped, the fullest of several', () => {
    expect(duplicateOf(all, caradoc)?.name).toBe('Caradoc Reed');
    expect(duplicateOf(all, father)?.name).toBe('Caradoc Reed');
    expect(duplicateOf([ent('Hedda'), ent('Hedda Vane')], ent('Hedda'))?.name).toBe('Hedda Vane');
  });

  it('gives none for two people, another kind, a namesake or a bare title', () => {
    expect(duplicateOf(all, all[2] as Entity)).toBeUndefined();
    expect(duplicateOf([ent('Hedda Vane', 'place')], ent('Hedda'))).toBeUndefined();
    expect(duplicateOf([ent('Lena')], ent('Lena'))).toBeUndefined();
    expect(duplicateOf([ent('Old Warden')], ent('Warden'))).toBeUndefined();
  });
});

describe('titleOf', () => {
  it("proposes a faction or place whose name holds a character's misspelt one-word name", () => {
    const weever = ent('Weever');
    const order = ent('Weaver of Fates', 'faction');
    expect(titleOf([weever, order], weever)?.name).toBe('Weaver of Fates');
    expect(titleOf([weever, order], order)?.name).toBe('Weever');
    expect(titleOf([ent('Hedda'), ent("Hedda's room", 'place')], ent('Hedda'))).toBeUndefined();
  });
});

describe('cardProposals', () => {
  it('proposes a near-duplicate the fold carded, once', () => {
    const adv = createBlankAdventure('T', '');
    adv.actions = [{ id: 'a0', type: 'continue', versions: ['The bell tolls and Father Caradoc looks up.'], active: 0, createdAt: 0 }];
    adv.entities = [ent('Caradoc Reed')];
    const fold = (e: Incoming) => foldEntities(adv, [e], adv.actions[0]?.versions[0] ?? '', { fromAction: 0, toAction: 1 });
    fold({ name: 'Father Caradoc', kind: 'character', description: '', facts: [] });
    fold({ name: 'Father Caradoc', kind: 'character', description: '', aliases: ['the priest'], facts: [] });
    expect(adv.entities.map((e) => e.name)).toEqual(['Caradoc Reed', 'Father Caradoc']);
    expect(adv.scriptState.__aliasProposals?.map((p) => [p.name, p.of])).toEqual([['Father Caradoc', adv.entities[0]?.id]]);
  });

  it('names the later card of the first, a title of the character, and skips a declined name', () => {
    const reed = ent('Caradoc Reed', 'character', 20);
    const caradoc = ent('Caradoc', 'character', 194);
    const weever = ent('Weever', 'character', 30);
    const order = ent('Weaver of Fates', 'faction', 5);
    expect(cardProposals([reed, caradoc, weever, order], [weever], [], 7)).toEqual([
      { name: 'Caradoc', of: reed.id, at: 7 },
      { name: 'Weaver of Fates', of: weever.id, at: 7 },
    ]);
    expect(cardProposals([reed, caradoc], [], [{ name: 'Caradoc', of: reed.id, at: -1 }], 7)).toEqual([]);
  });
});
