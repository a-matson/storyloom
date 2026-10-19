import { describe, expect, it } from 'vitest';
import { deckOf, drawComplication } from '@core/director';
import { createBlankAdventure, type Action } from '@core/model';

const adv = (title = 'Fantasy', deck?: unknown) => {
  const a = createBlankAdventure(title, 'You stand at the gate.');
  if (deck !== undefined) a.scriptState['deck'] = deck;
  return a;
};

const ai = (id: number, text: string): Action => ({ id: `a${id}`, type: 'continue', versions: [text], active: 0, createdAt: 0 });

describe('deckOf', () => {
  it('reads state.deck strings and objects', () => {
    expect(deckOf(adv('X', ['A fox appears, ', { cue: 'Rain falls, ', cooldown: 2 }])).deck).toEqual([
      { cue: 'A fox appears, ' },
      { cue: 'Rain falls, ', cooldown: 2 },
    ]);
  });

  it('falls back to the genre deck, with a warning, on a malformed state.deck', () => {
    const { deck, warning } = deckOf(adv('Fantasy', [{ nope: 1 }]));
    expect(deck).toEqual(deckOf(adv('Fantasy')).deck);
    expect(warning).toMatch(/state\.deck/);
  });

  it('gives an unknown genre the default deck', () => {
    expect(deckOf(adv('Whatever')).deck.map((c) => c.cue)).toContain('The weather turns: ');
    expect(deckOf(adv('Whatever')).deck).not.toEqual(deckOf(adv('Fantasy')).deck);
  });
});

describe('drawComplication', () => {
  it('never draws a card inside its cooldown, and says none when all are cooling', () => {
    const a = adv('X', ['A fox appears, ', 'Rain falls, ']);
    a.actions = [ai(0, 'A fox appears, and runs.'), ...[1, 2, 3, 4].map((i) => ai(i, 'Quiet.'))];
    for (const r of [0, 0.5, 0.99]) expect(drawComplication(a, () => r)).toEqual({ cue: 'Rain falls, ' });
    a.actions.push(ai(5, 'Rain falls, hard.'));
    expect(drawComplication(a)).toHaveProperty('none');
  });

  it('lets a per-card cooldown override the default', () => {
    const a = adv('X', [{ cue: 'A fox appears, ', cooldown: 3 }]);
    a.actions = [ai(0, 'A fox appears, and runs.'), ...[1, 2].map((i) => ai(i, 'Quiet.'))];
    expect(drawComplication(a)).toHaveProperty('none');
    a.actions.push(ai(3, 'Quiet.'));
    expect(drawComplication(a)).toEqual({ cue: 'A fox appears, ' });
  });
});
