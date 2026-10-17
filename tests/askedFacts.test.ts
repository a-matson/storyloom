import { describe, expect, it } from 'vitest';
import type { Action } from '@core/model/types';
import { act, actions, buildContext, cast, fact, input, lena, orrin, tamsin } from './fixtures/structured';

describe('facts for the asked-about absent', () => {
  const fears = [
    fact('Orrin', 0, 'He fears deep water.'),
    fact('Orrin', 2, 'He fears the water at night.'),
    fact('Orrin', 3, 'He once fell in the water and still fears it.'),
  ];
  const asking = (last: Action, o = { ...orrin, facts: [...fears, fact('Orrin', 4, 'He hums.')] }) => ({
    ...input(4000),
    actions: [...actions.slice(0, -2), act('continue', 'Orrin waits by the boats.'), last],
    entities: [lena, o, tamsin],
  });
  const orrinLine = (r: ReturnType<typeof buildContext>) =>
    cast(r)
      ?.split('\n')
      .find((l) => l.startsWith('Orrin'));

  it('an absent character the action names gets at most 2 matching facts on its identity line', () => {
    const r = buildContext(asking(act('do', '> You ask Lena whether Orrin fears the water.')));
    expect(orrinLine(r)).toBe('Orrin (a ferryman): He fears deep water; He fears the water at night.');
    expect(r.usedFacts.filter((f) => f.entityId === orrin.id).map((f) => f.factId)).toEqual(['as_f-Orrin-0', 'as_f-Orrin-2']);
  });

  it('an absent character named only in earlier history keeps the identity-only line', () => {
    expect(orrinLine(buildContext(asking(act('do', '> You ask Lena whether she fears the water.'))))).toBe('Orrin (a ferryman).');
  });

  it('a role in the action counts as naming it', () => {
    const r = buildContext(asking(act('do', '> You ask whether the boatman fears the water.'), { ...orrin, facts: fears, roles: ['the boatman'] }));
    expect(orrinLine(r)).toBe('Orrin (a ferryman): He fears deep water; He fears the water at night.');
  });

  it('a fact sharing one common word with the action is not sent', () => {
    // "water" is in two facts, more than the median term's one.
    const drinks = { ...orrin, facts: [fact('Orrin', 0, 'He drinks only water.')] };
    const i = asking(act('do', '> You ask Orrin about the water.'), drinks);
    const r = buildContext({ ...i, entities: [lena, drinks, { ...tamsin, facts: [fact('Tamsin', 0, 'She crossed the water.')] }] });
    expect(orrinLine(r)).toBe('Orrin (a ferryman).');
  });

  it('a continue or story action admits no facts', () => {
    for (const type of ['continue', 'story'] as const)
      expect(orrinLine(buildContext(asking(act(type, 'Whether Orrin fears the water, nobody knows.'))))).toBe('Orrin (a ferryman).');
  });

  it('present lines are unchanged and come first; a fact line that does not fit falls back to the identity line', () => {
    const i = asking(act('do', '> You ask Lena whether Orrin fears the water.'));
    const full = buildContext(i);
    const lenaLine = 'Lena (keeps the mill): wary; poisoned — the green wine; distrusts you; She hums.';
    expect(cast(full)?.split('\n')[0]).toBe(lenaLine);
    const share = (full.budget.structuredUsed - 2) / full.budget.total;
    const r = buildContext({ ...i, settings: { ...i.settings, structuredShare: share } });
    expect(cast(r)?.split('\n')).toEqual([lenaLine, 'Orrin (a ferryman).']);
    expect(r.usedFacts.some((f) => f.entityId === orrin.id)).toBe(false);
  });

  it('a carded absent entity still sends nothing', () => {
    const card = { id: 'c-orrin', type: 'Character', name: 'Orrin', entry: 'The hand-written Orrin.', triggers: ['Orrin'] };
    const r = buildContext({ ...asking(act('do', '> You ask Lena whether Orrin fears the water.')), storyCards: [card] });
    expect(orrinLine(r)).toBeUndefined();
  });
});
