import { describe, expect, it } from 'vitest';
import { cueFor, directorDue, drawDirector } from '@core/director';
import { indexAssertions } from '@core/memory';
import { createBlankAdventure, type Action, type ActionType } from '@core/model';

let n = 0;
const act = (type: ActionType, text: string): Action => ({ id: `a${n++}`, type, versions: [text], active: 0, createdAt: 0 });
const turn = (): Action[] => [act('do', '> You wait.'), act('continue', 'Nothing happens.')];
const turns = (k: number): Action[] => Array.from({ length: k }, turn).flat();

const adv = (...actions: Action[]) => {
  const a = createBlankAdventure('Fantasy', 'You stand at the gate.');
  a.entities = [{ id: 'ent_t', kind: 'character', name: 'Tamsin', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 1 }];
  a.plot = { ...a.plot, scene: { present: ['ent_t'] } };
  a.actions = actions;
  return a;
};
const beat = () => act('continue', `${cueFor('interrupt', 'Tamsin')}Stop."`);
const card = () => act('continue', 'The weather turns: rain.');
const ix = (a: ReturnType<typeof adv>) => indexAssertions(a.assertions);

describe('directorDue', () => {
  it('is due after N player turns', () => {
    expect(directorDue(adv(...turns(2)), 3)).toBe(false);
    expect(directorDue(adv(...turns(3)), 3)).toBe(true);
  });

  it('is not due after a Continue or a cued action', () => {
    expect(directorDue(adv(...turns(3), act('continue', 'More.')), 3)).toBe(false);
    expect(directorDue(adv(...turns(3), beat()), 3)).toBe(false);
  });

  it('is not due when a cued action is within N turns', () => {
    expect(directorDue(adv(...turns(3), card(), ...turns(2)), 3)).toBe(false);
    expect(directorDue(adv(...turns(3), card(), ...turns(3)), 3)).toBe(true);
  });
});

describe('drawDirector', () => {
  it('draws a complication when none came in the last 2N turns', () => {
    const a = adv(...turns(6));
    expect(drawDirector(a, ix(a), 3, () => 0)).toEqual({ cue: 'Just then, a rider comes ' });
  });

  it('draws a beat when a complication came recently', () => {
    const a = adv(...turns(1), card(), ...turns(3));
    expect(drawDirector(a, ix(a), 3, () => 0)).toEqual({ cue: expect.stringMatching(/^Tamsin /) });
  });

  it('falls back to a card when nobody is present', () => {
    const a = adv(card(), ...turns(3));
    a.plot = { ...a.plot, scene: { present: [] } };
    expect(drawDirector(a, ix(a), 3, () => 0)).toHaveProperty('cue');
  });
});
