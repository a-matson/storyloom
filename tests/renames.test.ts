import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities } from '@core/memory/fold';
import { renameCues } from '@core/memory/renames';
import { createBlankAdventure } from '@core/model/scenario';

const known = (...names: string[]) => names.map((name, i) => mergeEntity(undefined, { name, kind: 'character', description: '' }, i));
const cues = (passage: string, names: string[]) => [...renameCues(passage, known(...names)).values()].map((c) => c.name);

describe('renameCues', () => {
  it('proposes the other name a passage gives a known one', () => {
    const all = known('Vorthak');
    expect([...renameCues('Vorthak, known as Old Red, grins.', all).values()]).toEqual([{ name: 'Old Red', of: all[0]?.id }]);
    expect(cues('Old Red, or Vorthak, grins.', ['Vorthak'])).toEqual(['Old Red']);
  });

  it('leaves a misspelling, a role and a known name alone', () => {
    expect(cues('Weever, or Weaver, nods.', ['Weever'])).toEqual([]);
    expect(cues('Captain Marr, known as the Widow, nods.', ['Captain Marr'])).toEqual([]);
    expect(cues('Captain Marr, known as The Widow, nods.', ['Captain Marr'])).toEqual([]);
    expect(cues('Lena, or Mira, nods.', ['Lena', 'Mira'])).toEqual([]);
  });

  it('is proposed by the fold, which holds its card', () => {
    const adv = createBlankAdventure('T', '');
    const passage = 'You meet Vorthak, known as Old Red, by the loom.';
    adv.actions = [{ id: 'a0', type: 'continue', versions: [passage], active: 0, createdAt: 0 }];
    adv.entities = known('Vorthak');
    const fold = (names: string[]) =>
      foldEntities(
        adv,
        names.map((name) => ({ name, kind: 'character', description: '', facts: [] })),
        `[0] ${passage}`,
        { fromAction: 0, toAction: 1 },
      );
    expect(fold([])).toBe(1);
    expect(adv.scriptState.__aliasProposals?.map((p) => [p.name, p.of])).toEqual([['Old Red', adv.entities[0]?.id]]);
    fold(['Old Red']);
    expect(adv.entities.map((e) => e.name)).toEqual(['Vorthak']);
    expect(adv.scriptState.__aliasProposals).toHaveLength(1);
  });

  it('does not propose a pair the player said No to, but still proposes the name for another entity', () => {
    const adv = createBlankAdventure('T', '');
    const passage = 'You meet Vorthak, known as Old Red, and Halvord the smith.';
    adv.actions = [{ id: 'a0', type: 'continue', versions: [passage], active: 0, createdAt: 0 }];
    adv.entities = known('Vorthak', 'Halvard');
    const [vorthak = '', halvard = ''] = adv.entities.map((e) => e.id);
    const fold = () =>
      foldEntities(adv, [{ name: 'Halvord', kind: 'character', description: '', facts: [] }], `[0] ${passage}`, { fromAction: 0, toAction: 1 });
    adv.scriptState.__aliasRejected = [
      { name: 'old red', of: vorthak },
      { name: 'Halvord', of: 'other' },
    ];
    fold();
    expect(adv.scriptState.__aliasProposals?.map((p) => [p.name, p.of])).toEqual([['Halvord', halvard]]);
    adv.scriptState.__aliasRejected.push({ name: 'Halvord', of: halvard });
    adv.scriptState.__aliasProposals = [];
    fold();
    expect(adv.scriptState.__aliasProposals).toEqual([]);
    expect(adv.entities.map((e) => e.name)).toEqual(['Vorthak', 'Halvard', 'Halvord']);
  });
});
