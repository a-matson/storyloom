import { describe, expect, it } from 'vitest';
import { foldEntities, uncut } from '@core/memory/extract';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, ExtractedEntity } from '@core/model';

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });
const seen = (name: string, over: Partial<ExtractedEntity> = {}): ExtractedEntity => ({ name, kind: 'character', description: '', facts: [], ...over });

function fold(passage: string, incoming: ExtractedEntity[], thirdPerson?: string) {
  const adv = createBlankAdventure('T', '');
  adv.actions = [act('a0', passage)];
  if (thirdPerson) adv.plot = { ...adv.plot, thirdPerson: { enabled: true, name: thirdPerson } };
  foldEntities(adv, incoming, `[0] ${passage}`, { fromAction: 0, toAction: 1 });
  return adv.entities;
}

describe('foldEntities', () => {
  it('drops the player, how the story addresses them, and their third-person name', () => {
    const passage = 'You bow. "Yes, Master," says Tamsin to Aria. Aria smiles at Sir.';
    const names = fold(
      passage,
      ['Master', 'My Lord', 'Sir', 'Aria', 'Tamsin'].map((n) => seen(n)),
      'Aria',
    ).map((e) => e.name);
    expect(names).toEqual(['Tamsin']);
  });

  it('drops a new name the description makes a kind of creature', () => {
    const passage = 'You see Tamsin and the Vael beyond the river.';
    const out = fold(passage, [seen('Vael', { description: 'The Vael are a race of river spirits.' }), seen('Tamsin', { description: 'A ferrywoman.' })]);
    expect(out.map((e) => e.name)).toEqual(['Tamsin']);
  });

  it('trims a value the grammar cap cut, and drops a cut fact with nothing whole in it', () => {
    const cutDesc = `A ferrywoman who rows the dead. She is depicted as a stern and silent figure, often shown wea`.padEnd(120, 'x');
    const cutFact = 'x'.repeat(100);
    const [e] = fold('You meet Tamsin.', [seen('Tamsin', { description: cutDesc, facts: [cutFact, 'She rows.'] })]);
    expect(e?.description).toBe('A ferrywoman who rows the dead.');
    expect(e?.facts.map((f) => f.text)).toEqual(['She rows.']);
  });
});

describe('uncut', () => {
  it('keeps short or whole values, trims at a sentence end, else a comma', () => {
    expect(uncut('Owns a ferry')).toBe('Owns a ferry');
    const long = 'She is depicted as a stern and silent figure who rows the dead across the river every night, often shown wea';
    expect(uncut(long)).toBe('She is depicted as a stern and silent figure who rows the dead across the river every night');
    expect(uncut(`${long}.`)).toBe(`${long}.`);
  });
});
